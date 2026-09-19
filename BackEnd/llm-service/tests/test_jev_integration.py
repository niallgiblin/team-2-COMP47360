"""Wiring tests: chat_service uses Jev when available and falls back otherwise.

These monkeypatch ``chat_service.resolve_query_analysis`` so no network call
is made; the real Jev client is covered in ``test_jev_service.py``.
"""

from __future__ import annotations

import pytest

from jev_service import QueryAnalysis


def _fake_search_recorder(record):
    def fake_search(query, limit=5, location_filter=None):
        record.append({"query": query, "location_filter": location_filter})
        return [{
            "id": 1, "name": "Test Bar", "zone": "soho", "type": "Bar",
            "price": "$$", "rating": 4.2, "description": "A test bar",
            "summary": "test vibe", "tags": "test", "num_reviews": 10,
            "reviews": "Great place",
        }]
    return fake_search


def _fake_stream(messages, max_tokens=400, timeout=90):
    yield "Here "
    yield "you go"


# ---------------------------------------------------------------------------
# resolve / gate helpers
# ---------------------------------------------------------------------------


class TestResolveQueryAnalysis:
    def test_disabled_returns_none(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", False)
        assert chat_service.resolve_query_analysis("find a bar") is None

    def test_enabled_but_failure_returns_none(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(
            "jev_service.analyze_query",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")),
        )
        assert chat_service.resolve_query_analysis("find a bar") is None


class TestIsGeneralChatGate:
    def test_jev_signal_is_used_when_present(self):
        import chat_service

        # Regex would call this a venue query ("bars"), Jev says meta.
        analysis = QueryAnalysis(is_general_chat=True, general_chat_probability=0.95)
        assert chat_service._is_general_chat("what bars can you find?", analysis) is True

    def test_falls_back_to_regex_without_signal(self):
        import chat_service

        assert chat_service._is_general_chat("hello there", None) is True
        assert chat_service._is_general_chat("find a jazz bar in Midtown", None) is False


# ---------------------------------------------------------------------------
# stream_chat_response wiring
# ---------------------------------------------------------------------------


class TestStreamChatJevWiring:
    def test_jev_general_chat_skips_retrieval(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_query_analysis",
            lambda query, prev=None: QueryAnalysis(
                is_general_chat=True, general_chat_probability=0.9
            ),
        )

        def fake_hf(messages, max_tokens=200, timeout=15):
            return {"choices": [{"message": {"content": "Hi!"}}]}

        calls = []
        events = list(chat_service.stream_chat_response(
            query="find a bar",  # regex would treat this as a venue query
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder(calls),
            hf_call=fake_hf,
        ))
        assert calls == []  # retrieval skipped
        assert "event: done" in events[-1]
        assert '"citations": []' in events[-1].replace(" ", " ")

    def test_jev_location_flows_into_search_filter(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_query_analysis",
            lambda query, prev=None: QueryAnalysis(
                is_general_chat=False,
                general_chat_probability=0.05,
                location="soho",
                location_confidence=0.88,
            ),
        )
        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)

        calls = []
        list(chat_service.stream_chat_response(
            query="somewhere fun tonight",  # no regex-detectable zone
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder(calls),
            busyness_context="Live busyness: unavailable",
        ))
        assert calls, "retrieval should run"
        assert calls[0]["location_filter"] == "soho"

    def test_no_jev_signal_keeps_regex_behaviour(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service, "resolve_query_analysis", lambda query, prev=None: None
        )
        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)

        calls = []
        list(chat_service.stream_chat_response(
            query="best bars in midtown",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder(calls),
            busyness_context="Live busyness: unavailable",
        ))
        assert calls, "venue query should still retrieve"
        # No Jev location, no location_filter passed in → stays None (regex
        # extraction happens at the route layer, not inside chat_service).
        assert calls[0]["location_filter"] is None


# ---------------------------------------------------------------------------
# get_ai_response_with_metadata wiring
# ---------------------------------------------------------------------------


class TestNonStreamJevWiring:
    def test_jev_general_chat_returns_general_mode(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_query_analysis",
            lambda query, prev=None: QueryAnalysis(
                is_general_chat=True, general_chat_probability=0.91
            ),
        )

        def fake_hf(messages, max_tokens=200, timeout=15):
            return {"choices": [{"message": {"content": "Hello!"}}]}

        result = chat_service.get_ai_response_with_metadata(
            query="find a bar",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=fake_hf,
        )
        assert result.metadata.mode == "general_chat"
        assert result.text == "Hello!"

    def test_jev_location_flows_into_search_filter(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_query_analysis",
            lambda query, prev=None: QueryAnalysis(
                is_general_chat=False,
                location="harlem",
                location_confidence=0.8,
            ),
        )

        def fake_hf(messages, max_tokens=400, timeout=30):
            return {"choices": [{"message": {"content": "Try Test Bar [1]"}}]}

        calls = []
        chat_service.get_ai_response_with_metadata(
            query="fun plans tonight",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder(calls),
            hf_call=fake_hf,
            busyness_context="Live busyness: unavailable",
        )
        assert calls
        assert calls[0]["location_filter"] == "harlem"
