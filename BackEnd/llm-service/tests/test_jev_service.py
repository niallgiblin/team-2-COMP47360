"""Unit tests for jev_service.py — client transport, parsing, and fallbacks.

No network access: every Jev call is injected via a fake client/transport.
"""

from __future__ import annotations

import pytest

from jev_service import (
    AnswerVerification,
    JevClient,
    JevError,
    QueryAnalysis,
    analyze_query,
    build_judge_questions,
    build_query_questions,
    build_verification_questions,
    choice,
    judge_answer,
    noul,
    score,
    verify_answer,
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


# ---------------------------------------------------------------------------
# Faithfulness guardrail — verify_answer
# ---------------------------------------------------------------------------


class TestVerificationQuestions:
    def test_question_shape(self):
        questions = build_verification_questions()
        assert set(questions) == {"faithful", "fabricated_venue", "unsupported_detail"}
        assert all(q["type"] == "noul" for q in questions.values())


class TestVerifyAnswer:
    _CONTEXT = "1. Tomi Jazz — Zone: Midtown, Type: Jazz Bar, Rating: 4.3/5."
    _ANSWER = "Tomi Jazz [1] is a jazz bar in Midtown rated 4.3/5."

    def _client(self, **noul_overrides):
        answers = {
            "faithful": {"noul": noul_overrides.get("faithful", 0.95)},
            "fabricated_venue": {"noul": noul_overrides.get("fabricated_venue", 0.02)},
            "unsupported_detail": {"noul": noul_overrides.get("unsupported_detail", 0.05)},
        }
        return FakeClient(answers)

    def test_grounded_answer(self):
        result = verify_answer(
            self._ANSWER, self._CONTEXT,
            client=self._client(), enabled=True, confidence_threshold=0.5,
        )
        assert isinstance(result, AnswerVerification)
        assert result.grounded is True

    def test_ungrounded_when_not_faithful(self):
        result = verify_answer(
            self._ANSWER, self._CONTEXT,
            client=self._client(faithful=0.2), enabled=True,
        )
        assert result.grounded is False

    def test_ungrounded_when_venue_fabricated(self):
        result = verify_answer(
            self._ANSWER, self._CONTEXT,
            client=self._client(fabricated_venue=0.9), enabled=True,
        )
        assert result.grounded is False

    def test_ungrounded_when_detail_unsupported(self):
        result = verify_answer(
            self._ANSWER, self._CONTEXT,
            client=self._client(unsupported_detail=0.85), enabled=True,
        )
        assert result.grounded is False

    def test_disabled_returns_none(self):
        assert verify_answer(
            self._ANSWER, self._CONTEXT, client=self._client(), enabled=False
        ) is None

    def test_blank_answer_returns_none(self):
        assert verify_answer("", self._CONTEXT, client=self._client(), enabled=True) is None

    def test_transport_error_returns_none(self):
        assert verify_answer(
            self._ANSWER, self._CONTEXT,
            client=FakeClient(error=JevError("boom")), enabled=True,
        ) is None

    def test_venue_names_forwarded_in_state(self):
        client = self._client()
        verify_answer(
            self._ANSWER, self._CONTEXT,
            venue_names=["Tomi Jazz", "Blue Note"],
            client=client, enabled=True,
        )
        state, _questions = client.calls[0]
        assert state["known_venue_names"] == ["Tomi Jazz", "Blue Note"]


# ---------------------------------------------------------------------------
# Jev-backed evaluation judge
# ---------------------------------------------------------------------------


def _score_answer(score, confidence=0.8):
    legend = {str(i): f"level {i}" for i in range(5)}
    return {
        "type": "score",
        "score": score,
        "legend": legend,
        "probabilities": {str(i): (0.7 if i == round(score) else 0.075) for i in range(5)},
        "confidence": confidence,
    }


class TestJevJudge:
    def _client(self, faith=4.0, relev=4.0, prec=3.0):
        return FakeClient({
            "faithfulness": _score_answer(faith),
            "answer_relevancy": _score_answer(relev),
            "context_precision": _score_answer(prec),
        })

    def test_question_shape(self):
        questions = build_judge_questions()
        assert set(questions) == {"faithfulness", "answer_relevancy", "context_precision"}
        for q in questions.values():
            assert q["type"] == "score"
            assert len(q["criteria"]) == 5

    def test_score_to_unit_mapping(self):
        from jev_service import _score_to_unit

        assert _score_to_unit(_score_answer(0)) == 0.0
        assert _score_to_unit(_score_answer(4)) == 1.0
        assert _score_to_unit(_score_answer(2)) == pytest.approx(0.5)

    def test_judge_answer_returns_unit_scores(self):
        result = judge_answer(
            "q", "a", "ctx", client=self._client(faith=4, relev=3, prec=2), enabled=True
        )
        assert result["faithfulness"] == pytest.approx(1.0)
        assert result["answer_relevancy"] == pytest.approx(0.75)
        assert result["context_precision"] == pytest.approx(0.5)
        assert "jev" in result["faithfulness_reasoning"].lower()
        assert result["faithfulness_reasoning"]

    def test_judge_disabled_returns_none(self):
        assert judge_answer("q", "a", "ctx", client=self._client(), enabled=False) is None

    def test_judge_blank_answer_returns_none(self):
        assert judge_answer("q", "", "ctx", client=self._client(), enabled=True) is None

    def test_judge_error_returns_none(self):
        assert judge_answer(
            "q", "a", "ctx",
            client=FakeClient(error=JevError("boom")), enabled=True,
        ) is None

    def test_judge_missing_dimension_returns_none(self):
        # Client omits one dimension → treat as judge failure.
        client = FakeClient({
            "faithfulness": _score_answer(4),
            "answer_relevancy": _score_answer(4),
        })
        assert judge_answer("q", "a", "ctx", client=client, enabled=True) is None
