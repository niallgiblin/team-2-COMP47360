"""Wiring tests: chat_service uses Jev when available and falls back otherwise.

These monkeypatch ``chat_service.resolve_query_analysis`` so no network call
is made; the real Jev client is covered in ``test_jev_service.py``.
"""

from __future__ import annotations

import pytest

from jev_service import AnswerabilityAssessment, AnswerVerification, QueryAnalysis


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


# ---------------------------------------------------------------------------
# Faithfulness guardrail wiring
# ---------------------------------------------------------------------------


class TestResolveAnswerVerification:
    def test_disabled_when_guardrail_flag_off(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_GUARDRAIL_ENABLED", False)
        assert chat_service.resolve_answer_verification(
            "answer", "context", [{"name": "X"}]
        ) is None

    def test_none_without_citations(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_GUARDRAIL_ENABLED", True)
        assert chat_service.resolve_answer_verification("answer", "context", []) is None

    def test_failure_returns_none(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_GUARDRAIL_ENABLED", True)
        monkeypatch.setattr(
            "jev_service.verify_answer",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")),
        )
        assert chat_service.resolve_answer_verification(
            "answer", "context", [{"name": "X"}]
        ) is None


class TestGuardrailNonStreaming:
    def _hf(self, text="Try Test Bar [1]"):
        def fake_hf(messages, max_tokens=400, timeout=30):
            return {"choices": [{"message": {"content": text}}]}
        return fake_hf

    def test_ungrounded_answer_replaced_with_fallback(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answer_verification",
            lambda *a, **k: AnswerVerification(
                grounded=False, action="replace", faithful_probability=0.1,
                fabricated_venue_probability=0.95,
            ),
        )
        result = chat_service.get_ai_response_with_metadata(
            query="bars in soho",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=self._hf("Invented Venue [1] has amazing drinks"),
            busyness_context="Live busyness: unavailable",
        )
        assert "couldn't verify every detail" in result.text
        assert result.metadata.fallback_triggered is True
        assert result.metadata.error_stage == "verification"
        assert result.metadata.error_code == "ungrounded_answer"
        assert result.metadata.guardrail_action == "replace"

    def test_caveat_answer_kept_and_flagged(self, monkeypatch):
        """Caveat tier keeps the answer and appends the unverified notice."""
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answer_verification",
            lambda *a, **k: AnswerVerification(
                grounded=False, action="caveat", faithful_probability=0.4,
                fabricated_venue_probability=0.03,
                unsupported_detail_probability=0.6,
            ),
        )
        result = chat_service.get_ai_response_with_metadata(
            query="bars in soho",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=self._hf("Try Test Bar [1] has great drinks"),
            busyness_context="Live busyness: unavailable",
        )
        assert "Try Test Bar" in result.text  # answer preserved
        assert "couldn't verify every detail" in result.text  # caveat appended
        assert result.metadata.fallback_triggered is False
        assert result.metadata.guardrail_action == "caveat"

    def test_grounded_answer_kept(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answer_verification",
            lambda *a, **k: AnswerVerification(grounded=True),
        )
        result = chat_service.get_ai_response_with_metadata(
            query="bars in soho",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=self._hf("Try Test Bar [1]"),
            busyness_context="Live busyness: unavailable",
        )
        assert "Try Test Bar" in result.text
        assert result.metadata.fallback_triggered is False


class TestGuardrailStreaming:
    def test_ungrounded_streamed_answer_replaced_in_done(self, monkeypatch):
        import chat_service

        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)
        monkeypatch.setattr(
            chat_service,
            "resolve_answer_verification",
            lambda *a, **k: AnswerVerification(
                grounded=False, action="replace", faithful_probability=0.05,
                fabricated_venue_probability=0.9,
            ),
        )
        events = list(chat_service.stream_chat_response(
            query="bars in soho",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            busyness_context="Live busyness: unavailable",
        ))
        assert "event: done" in events[-1]
        assert "couldn't verify every detail" in events[-1]
        assert '"verified": false' in events[-1]
        assert '"guardrail_action": "replace"' in events[-1]

    def test_caveat_streamed_answer_kept_in_done(self, monkeypatch):
        import chat_service

        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)
        monkeypatch.setattr(
            chat_service,
            "resolve_answer_verification",
            lambda *a, **k: AnswerVerification(
                grounded=False, action="caveat", faithful_probability=0.4,
            ),
        )
        events = list(chat_service.stream_chat_response(
            query="bars in soho",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            busyness_context="Live busyness: unavailable",
        ))
        assert "Here you go" in events[-1]  # original streamed text kept
        assert "couldn't verify every detail" in events[-1]
        assert '"guardrail_action": "caveat"' in events[-1]


# ---------------------------------------------------------------------------
# Jev judge + --jev harness wiring
# ---------------------------------------------------------------------------


class TestJevJudgeDispatch:
    def test_score_with_ragas_jev_uses_jev_judge(self, monkeypatch):
        import eval_service

        monkeypatch.setattr(
            "jev_service.judge_answer",
            lambda question, answer, context, **k: {
                "faithfulness": 0.8,
                "answer_relevancy": 0.9,
                "context_precision": 0.7,
                "faithfulness_reasoning": "x",
                "answer_relevancy_reasoning": "y",
                "context_precision_reasoning": "z",
            },
        )
        scores = eval_service.score_with_ragas("q", "a", ["c1"], judge="jev")
        assert scores == {
            "faithfulness": 0.8,
            "answer_relevancy": 0.9,
            "context_precision": 0.7,
        }

    def test_score_with_ragas_jev_failure_returns_none_scores(self, monkeypatch):
        import eval_service

        monkeypatch.setattr("jev_service.judge_answer", lambda *a, **k: None)
        scores = eval_service.score_with_ragas("q", "a", ["c1"], judge="jev")
        assert scores["faithfulness"] is None
        assert scores["answer_relevancy"] is None
        assert scores["context_precision"] is None


class _FakeSearchService:
    def search(self, query, limit=5, location_filter=None, price_range=None, mode="auto"):
        return [{
            "id": 1, "name": "Test Bar", "zone": "soho", "type": "Bar",
            "price": "$$", "rating": 4.2, "description": "d", "summary": "s",
            "similarity": 0.9,
        }]


class TestRunRagasEvalJevPath:
    def test_use_jev_routes_generation_and_records_guardrail(self, monkeypatch):
        import chat_service
        import eval_service
        from observability import ChatExecutionMetadata, ChatExecutionResult

        captured = {}

        def fake_gen(query, previous_questions, previous_responses=None,
                     search_helper=None, hf_call=None, busyness_context=None,
                     location_filter=None):
            captured["helper_result"] = search_helper(query) if search_helper else None
            return ChatExecutionResult(
                "Grounded answer [1]",
                [{"name": "Test Bar"}],
                ChatExecutionMetadata(
                    mode="hybrid", retrieval_started=True, candidates=1,
                    fallback_triggered=True, retrieval_elapsed_s=0.0,
                    generation_elapsed_s=0.0, error_stage="verification",
                    error_code="ungrounded_answer", guardrail_action="replace",
                ),
            )

        monkeypatch.setattr(chat_service, "get_ai_response_with_metadata", fake_gen)
        monkeypatch.setattr(
            "jev_service.judge_answer",
            lambda *a, **k: {
                "faithfulness": 0.9,
                "answer_relevancy": 1.0,
                "context_precision": 1.0,
                "faithfulness_reasoning": "x",
                "answer_relevancy_reasoning": "y",
                "context_precision_reasoning": "z",
            },
        )

        entry = {
            "id": "Q999", "category": "retrieval", "query": "bars in soho",
            "expected_venue_ids": [1],
        }
        results = eval_service.run_ragas_eval(
            [entry], _FakeSearchService(),
            use_jev=True, judge="jev", ragas_only=True,
        )
        assert len(results) == 1
        r = results[0]
        assert r["answer"] == "Grounded answer [1]"
        assert r["guardrail_triggered"] is True
        assert r["mode"] == "hybrid"
        assert r["ragas_scores"]["faithfulness"] == 0.9
        # The pre-computed helper must hand the already-retrieved results back.
        assert captured["helper_result"][0]["name"] == "Test Bar"

    def test_build_combined_report_counts_guardrail(self):
        import eval_service

        report = eval_service.build_combined_report([
            {"id": "a", "category": "retrieval", "query": "q", "answer": "",
             "retrieved_ids": [], "guardrail_triggered": True},
            {"id": "b", "category": "retrieval", "query": "q", "answer": "",
             "retrieved_ids": [], "guardrail_triggered": False},
        ])
        assert report["guardrail"]["triggered_total"] == 1
        assert report["guardrail"]["categories"]["retrieval"] == 1


# ---------------------------------------------------------------------------
# Calibrated abstention wiring
# ---------------------------------------------------------------------------


class TestResolveAnswerability:
    def test_disabled_when_flag_off(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_ABSTENTION_ENABLED", False)
        assert chat_service.resolve_answerability("q", [{"name": "X"}]) is None

    def test_none_without_citations(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_ABSTENTION_ENABLED", True)
        assert chat_service.resolve_answerability("q", []) is None

    def test_failure_returns_none(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(chat_service, "JEV_ENABLED", True)
        monkeypatch.setattr(chat_service, "JEV_ABSTENTION_ENABLED", True)
        monkeypatch.setattr(
            "jev_service.assess_answerability",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")),
        )
        assert chat_service.resolve_answerability("q", [{"name": "X"}]) is None


class TestAbstentionStreaming:
    def test_abstains_and_returns_no_citations(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answerability",
            lambda q, c: AnswerabilityAssessment(
                answerable=False, answerable_probability=0.05,
                out_of_scope_probability=0.9, should_abstain=True,
            ),
        )
        events = list(chat_service.stream_chat_response(
            query="bars in Brooklyn with live music",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            busyness_context="Live busyness: unavailable",
        ))
        assert "event: done" in events[-1]
        assert "couldn't find a good match" in events[-1]
        assert '"citations": []' in events[-1].replace(" ", " ")
        assert '"abstained": true' in events[-1]

    def test_not_abstaining_proceeds_to_generation(self, monkeypatch):
        import chat_service

        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)
        monkeypatch.setattr(
            chat_service,
            "resolve_answerability",
            lambda q, c: AnswerabilityAssessment(
                answerable=True, answerable_probability=0.95, should_abstain=False,
            ),
        )
        events = list(chat_service.stream_chat_response(
            query="jazz bars in midtown",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            busyness_context="Live busyness: unavailable",
        ))
        assert "event: done" in events[-1]
        assert "couldn't find a good match" not in events[-1]


class TestAbstentionNonStreaming:
    def test_abstains_with_mode_and_no_citations(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answerability",
            lambda q, c: AnswerabilityAssessment(
                answerable=False, answerable_probability=0.02,
                out_of_scope_probability=0.95, should_abstain=True,
            ),
        )

        def _should_not_run(*a, **k):
            raise AssertionError("generation must be skipped when abstaining")

        result = chat_service.get_ai_response_with_metadata(
            query="dentists in Upper East Side accepting new patients",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=_should_not_run,
            busyness_context="Live busyness: unavailable",
        )
        assert result.text == chat_service.ABSTENTION_MESSAGE
        assert result.citations == []
        assert result.metadata.mode == "abstention"
        assert result.metadata.fallback_triggered is False

    def test_not_abstaining_proceeds(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_answerability",
            lambda q, c: AnswerabilityAssessment(should_abstain=False),
        )

        def fake_hf(messages, max_tokens=400, timeout=30):
            return {"choices": [{"message": {"content": "Try Test Bar [1]"}}]}

        result = chat_service.get_ai_response_with_metadata(
            query="jazz bars in midtown",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            hf_call=fake_hf,
            busyness_context="Live busyness: unavailable",
        )
        assert result.text != chat_service.ABSTENTION_MESSAGE
        assert result.metadata.mode != "abstention"


# ---------------------------------------------------------------------------
# Route-layer query analysis (compute once, pass down)
# ---------------------------------------------------------------------------


class TestAnalysisPassedDown:
    def test_service_does_not_recompute_when_analysis_supplied(self, monkeypatch):
        import chat_service

        monkeypatch.setattr(
            chat_service,
            "resolve_query_analysis",
            lambda *a, **k: (_ for _ in ()).throw(
                AssertionError("must not recompute when analysis is passed")
            ),
        )
        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)

        calls = []
        analysis = QueryAnalysis(
            is_general_chat=False, location="soho", location_confidence=0.9,
        )
        list(chat_service.stream_chat_response(
            query="somewhere fun",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder(calls),
            busyness_context="Live busyness: unavailable",
            query_analysis=analysis,
        ))
        assert calls and calls[0]["location_filter"] == "soho"

    def test_service_computes_when_analysis_not_supplied(self, monkeypatch):
        """Legacy callers (no query_analysis) still trigger the computation."""
        import chat_service

        seen = {"n": 0}

        def fake_resolve(query, prev=None):
            seen["n"] += 1
            return None

        monkeypatch.setattr(chat_service, "resolve_query_analysis", fake_resolve)
        monkeypatch.setattr("chat_service._stream_hf_response", _fake_stream)
        list(chat_service.stream_chat_response(
            query="jazz bars",
            previous_questions=[],
            previous_responses=[],
            search_helper=_fake_search_recorder([]),
            busyness_context="Live busyness: unavailable",
        ))
        assert seen["n"] == 1


# ---------------------------------------------------------------------------
# Jev-composed search query (replaces HF rewrite_query)
# ---------------------------------------------------------------------------


class TestComposeSearchQuery:
    def test_composes_location_price_and_categories(self):
        from chat_service import compose_search_query
        from jev_service import QueryAnalysis

        analysis = QueryAnalysis(
            location="midtown", price_tier="budget",
            categories=("jazz", "live music"),
        )
        assert compose_search_query("find a bar", analysis) == (
            "find a bar midtown budget jazz live music"
        )

    def test_none_analysis_returns_query_unchanged(self):
        from chat_service import compose_search_query

        assert compose_search_query("find a bar", None) == "find a bar"

    def test_empty_fields_are_omitted(self):
        from chat_service import compose_search_query
        from jev_service import QueryAnalysis

        assert compose_search_query("bar", QueryAnalysis(is_general_chat=False)) == "bar"
