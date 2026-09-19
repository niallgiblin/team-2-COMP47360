"""Unit tests for jev_service.py — client transport, parsing, and fallbacks.

No network access: every Jev call is injected via a fake client/transport.
"""

from __future__ import annotations

import pytest

from jev_service import (
    JevClient,
    JevError,
    QueryAnalysis,
    analyze_query,
    build_query_questions,
    choice,
    noul,
    score,
)


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeClient:
    """Injected stand-in for JevClient."""

    def __init__(self, answers=None, error=None, available=True):
        self._answers = answers or {}
        self._error = error
        self.available = available
        self.calls = []

    def system_one(self, state, questions, **kwargs):
        self.calls.append((state, questions))
        if self._error:
            raise self._error
        return self._answers


def _answers(**overrides):
    base = {
        "is_general_chat": {"type": "noul", "noul": 0.05},
        "location": {
            "type": "choice",
            "choice": "midtown",
            "probabilities": {"none": 0.1, "midtown": 0.8, "soho": 0.1},
            "confidence": 0.72,
        },
        "price_tier": {
            "type": "choice",
            "choice": "unspecified",
            "probabilities": {"unspecified": 0.9, "budget": 0.1},
            "confidence": 0.81,
        },
        "category:jazz": {"type": "noul", "noul": 0.91},
        "category:rooftop": {"type": "noul", "noul": 0.12},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Question builders
# ---------------------------------------------------------------------------


class TestQuestionBuilders:
    def test_noul_shape(self):
        q = noul("Is it urgent?", {"true": "yes", "false": "no"})
        assert q["type"] == "noul"
        assert q["instructions"] == "Is it urgent?"
        assert q["criteria"]["true"] == "yes"

    def test_choice_shape(self):
        q = choice("Which team?", {"a": "A team", "b": None})
        assert q["type"] == "choice"
        assert q["criteria"]["b"] is None

    def test_score_shape(self):
        q = score("How angry?", ["Calm", "Angry"])
        assert q["type"] == "score"
        assert q["criteria"] == ["Calm", "Angry"]

    def test_build_query_questions_includes_zones_and_categories(self):
        questions = build_query_questions(
            zones=["Midtown", "soho", "midtown"], categories=["jazz"]
        )
        assert "is_general_chat" in questions
        assert "price_tier" in questions
        # location choice includes explicit 'none' plus deduped, lowercased zones
        criteria = questions["location"]["criteria"]
        assert criteria["none"].startswith("No Manhattan")
        assert set(criteria) == {"none", "midtown", "soho"}
        assert "category:jazz" in questions

    def test_build_query_questions_omits_location_without_zones(self):
        questions = build_query_questions(zones=None, categories=["jazz"])
        assert "location" not in questions
        assert "category:jazz" in questions


# ---------------------------------------------------------------------------
# Parsing / confidence gating
# ---------------------------------------------------------------------------


class TestAnalyzeQueryParsing:
    def test_happy_path(self):
        result = analyze_query(
            "find me a jazz bar in midtown",
            client=FakeClient(_answers()),
            enabled=True,
            confidence_threshold=0.5,
        )
        assert isinstance(result, QueryAnalysis)
        assert result.is_general_chat is False
        assert result.location == "midtown"
        assert result.location_confidence == pytest.approx(0.72)
        assert result.price_tier is None  # 'unspecified'
        assert result.categories == ("jazz",)
        assert result.category_probabilities["jazz"] == pytest.approx(0.91)

    def test_none_location_when_choice_is_none(self):
        result = analyze_query(
            "good cocktail bars",
            client=FakeClient(_answers(location={
                "type": "choice",
                "choice": "none",
                "probabilities": {"none": 0.95},
                "confidence": 0.9,
            })),
            enabled=True,
        )
        assert result.location is None
        assert result.location_confidence == pytest.approx(0.9)

    def test_low_confidence_location_is_not_acted_on(self):
        result = analyze_query(
            "somewhere",
            client=FakeClient(_answers(location={
                "type": "choice",
                "choice": "midtown",
                "probabilities": {"none": 0.45, "midtown": 0.4, "soho": 0.15},
                "confidence": 0.2,
            })),
            enabled=True,
            confidence_threshold=0.5,
        )
        assert result.location is None
        assert result.location_confidence == pytest.approx(0.2)

    def test_general_chat_flag_uses_probability(self):
        result = analyze_query(
            "how do you work?",
            client=FakeClient(_answers(
                is_general_chat={"type": "noul", "noul": 0.93}
            )),
            enabled=True,
            confidence_threshold=0.5,
        )
        assert result.is_general_chat is True
        assert result.general_chat_probability == pytest.approx(0.93)

    def test_price_tier_acted_on_when_confident(self):
        result = analyze_query(
            "cheap eats",
            client=FakeClient(_answers(price_tier={
                "type": "choice",
                "choice": "budget",
                "probabilities": {"unspecified": 0.1, "budget": 0.85},
                "confidence": 0.7,
            })),
            enabled=True,
        )
        assert result.price_tier == "budget"

    def test_categories_sorted_by_probability(self):
        result = analyze_query(
            "jazz and rooftops",
            client=FakeClient(_answers(**{
                "category:jazz": {"type": "noul", "noul": 0.7},
                "category:rooftop": {"type": "noul", "noul": 0.95},
            })),
            enabled=True,
        )
        assert result.categories == ("rooftop", "jazz")


# ---------------------------------------------------------------------------
# Fallback behaviour — analyze_query must never raise
# ---------------------------------------------------------------------------


class TestAnalyzeQueryFallbacks:
    def test_disabled_returns_none(self):
        assert analyze_query("anything", enabled=False) is None

    def test_blank_query_returns_none(self):
        assert analyze_query("   ", client=FakeClient(_answers()), enabled=True) is None

    def test_no_api_key_returns_none(self):
        client = JevClient(api_key="")
        assert analyze_query(
            "find a bar", client=client, enabled=True
        ) is None

    def test_transport_error_returns_none(self):
        result = analyze_query(
            "find a bar",
            client=FakeClient(error=JevError("boom")),
            enabled=True,
        )
        assert result is None

    def test_unexpected_error_returns_none(self):
        result = analyze_query(
            "find a bar",
            client=FakeClient(error=RuntimeError("kaboom")),
            enabled=True,
        )
        assert result is None

    def test_history_is_forwarded_in_state(self):
        client = FakeClient(_answers())
        analyze_query(
            "what about cheaper ones?",
            previous_questions=["bars in midtown", "rooftops"],
            client=client,
            enabled=True,
        )
        state, _questions = client.calls[0]
        assert state["current_message"] == "what about cheaper ones?"
        assert state["previous_questions"] == ["bars in midtown", "rooftops"]


# ---------------------------------------------------------------------------
# HTTP client: retries and error mapping
# ---------------------------------------------------------------------------


class TestJevClient:
    def _client(self, transport, **kwargs):
        return JevClient(
            api_key="ts_test_key",
            transport=transport,
            max_retries=kwargs.pop("max_retries", 2),
            **kwargs,
        )

    def test_missing_key_is_unavailable(self):
        assert JevClient(api_key="").available is False
        assert JevClient(api_key="your-key").available is False
        assert JevClient(api_key="ts_live").available is True

    def test_system_one_returns_answers(self):
        transport = lambda *a, **k: FakeResponse(  # noqa: E731
            payload={"answers": {"is_general_chat": {"noul": 0.1}}}
        )
        answers = self._client(transport).system_one("hi", {"is_general_chat": noul("q")})
        assert answers["is_general_chat"]["noul"] == 0.1

    def test_retries_then_succeeds_on_429(self):
        calls = {"n": 0}

        def transport(*a, **k):
            calls["n"] += 1
            if calls["n"] == 1:
                return FakeResponse(status_code=429)
            return FakeResponse(payload={"answers": {"x": {"noul": 0.5}}})

        # Avoid real sleeping during backoff.
        import jev_service as mod
        original_sleep = mod.time.sleep
        mod.time.sleep = lambda *_: None
        try:
            answers = self._client(transport).system_one("hi", {"x": noul("q")})
        finally:
            mod.time.sleep = original_sleep
        assert calls["n"] == 2
        assert answers["x"]["noul"] == 0.5

    def test_client_error_is_not_retried(self):
        calls = {"n": 0}

        def transport(*a, **k):
            calls["n"] += 1
            return FakeResponse(status_code=401, text="unauthorized")

        with pytest.raises(JevError):
            self._client(transport).system_one("hi", {"x": noul("q")})
        assert calls["n"] == 1

    def test_missing_key_raises(self):
        with pytest.raises(JevError):
            JevClient(api_key="").system_one("hi", {"x": noul("q")})

    def test_exhausted_retries_raise(self):
        def transport(*a, **k):
            raise ConnectionError("no route to host")

        import jev_service as mod
        original_sleep = mod.time.sleep
        mod.time.sleep = lambda *_: None
        try:
            with pytest.raises(JevError):
                self._client(transport, max_retries=1).system_one(
                    "hi", {"x": noul("q")}
                )
        finally:
            mod.time.sleep = original_sleep
