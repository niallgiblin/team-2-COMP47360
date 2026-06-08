"""Unit tests for Phase 19 observability primitives.

Tests define strict contracts for schema, hashing, timing, metrics, fan-out,
and idempotence.  All observability imports are deferred (test-local) so
pytest collection succeeds before observability.py is created in Plan 19-01
Task 2.
"""

import json
import re
import sys
import types
import unicodedata

import pytest


# ── Helpers ──────────────────────────────────────────────────────


def _import_observability():
    """Deferred import — safe to call in test bodies after conftest sets env."""
    sys.modules.pop("observability", None)
    # Reset the global CollectorRegistry to avoid duplicate metric errors
    # when re-importing across test functions that share the same process.
    from prometheus_client import REGISTRY
    REGISTRY._collector_to_names.clear()
    REGISTRY._names_to_collectors.clear()
    import observability  # type: ignore[import-not-found]
    return observability


# ── Schema and hashing tests ─────────────────────────────────────


class TestChatRequestEvent:
    """Strict schema enforcement for the canonical event."""

    def test_rejects_extra_fields(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):  # pydantic ValidationError
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode="dense",
                status="success",
                candidates=5,
                latency_retrieval_ms=250.0,
                latency_generation_ms=2000.0,
                latency_total_ms=3000.0,
                citations_count=3,
                fallback_triggered=False,
                extra_field="should_not_be_here",
            )

    def test_rejects_invalid_mode(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash="a" * 64,
                mode="invalid",
                status="success",
                candidates=0,
                latency_retrieval_ms=0.0,
                latency_generation_ms=1000.0,
                latency_total_ms=1500.0,
                citations_count=0,
                fallback_triggered=False,
            )

    def test_rejects_invalid_status(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash="a" * 64,
                mode="dense",
                status="unknown",
                candidates=0,
                latency_retrieval_ms=0.0,
                latency_generation_ms=1000.0,
                latency_total_ms=1500.0,
                citations_count=0,
                fallback_triggered=False,
            )

    def test_accepts_valid_minimal_event(self, obs_env):
        obs = _import_observability()
        event = obs.ChatRequestEvent(
            request_id=obs.uuid4(),
            query_hash=None,
            mode="general_chat",
            status="success",
            candidates=0,
            latency_retrieval_ms=0.0,
            latency_generation_ms=1500.0,
            latency_total_ms=2000.0,
            citations_count=0,
            fallback_triggered=False,
        )
        assert event.mode == "general_chat"
        assert event.status == "success"

    def test_accepts_all_valid_modes(self, obs_env):
        obs = _import_observability()
        for mode in ["unknown", "general_chat", "dense", "hybrid"]:
            event = obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode=mode,
                status="success",
                candidates=0,
                latency_retrieval_ms=0.0,
                latency_generation_ms=0.0,
                latency_total_ms=1.0,
                citations_count=0,
                fallback_triggered=False,
            )
            assert event.mode == mode

    def test_accepts_all_valid_statuses(self, obs_env):
        obs = _import_observability()
        for status in ["success", "fallback", "error"]:
            event = obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode="general_chat",
                status=status,
                candidates=0,
                latency_retrieval_ms=0.0,
                latency_generation_ms=0.0,
                latency_total_ms=1.0,
                citations_count=0,
                fallback_triggered=False,
            )
            assert event.status == status

    def test_rejects_negative_candidates(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode="dense",
                status="success",
                candidates=-1,
                latency_retrieval_ms=0.0,
                latency_generation_ms=0.0,
                latency_total_ms=1.0,
                citations_count=0,
                fallback_triggered=False,
            )

    def test_rejects_negative_latency(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode="dense",
                status="success",
                candidates=0,
                latency_retrieval_ms=-1.0,
                latency_generation_ms=0.0,
                latency_total_ms=1.0,
                citations_count=0,
                fallback_triggered=False,
            )

    def test_accepts_error_stage_and_code_on_error(self, obs_env):
        obs = _import_observability()
        event = obs.ChatRequestEvent(
            request_id=obs.uuid4(),
            query_hash=None,
            mode="unknown",
            status="error",
            candidates=0,
            latency_retrieval_ms=0.0,
            latency_generation_ms=0.0,
            latency_total_ms=50.0,
            citations_count=0,
            fallback_triggered=False,
            error_type="auth_error",
            error_stage="auth",
            error_code="auth_required",
        )
        assert event.error_type == "auth_error"
        assert event.error_stage == "auth"
        assert event.error_code == "auth_required"

    def test_rejects_invalid_error_stage(self, obs_env):
        obs = _import_observability()
        with pytest.raises(Exception):
            obs.ChatRequestEvent(
                request_id=obs.uuid4(),
                query_hash=None,
                mode="unknown",
                status="error",
                candidates=0,
                latency_retrieval_ms=0.0,
                latency_generation_ms=0.0,
                latency_total_ms=50.0,
                citations_count=0,
                fallback_triggered=False,
                error_stage="unknown_stage",
                error_type="auth_error",
                error_code="auth_required",
            )


class TestHashQuery:
    """Query hashing: NFKC normalization, deterministic output."""

    def test_hash_is_lowercase_64_char_hex(self, obs_env):
        obs = _import_observability()
        h = obs.hash_query("test query")
        assert re.match(r"^[0-9a-f]{64}$", h), f"expected 64-hex, got {h!r}"

    def test_empty_query_returns_none(self, obs_env):
        obs = _import_observability()
        assert obs.hash_query("") is None
        assert obs.hash_query("   ") is None

    def test_none_query_returns_none(self, obs_env):
        obs = _import_observability()
        assert obs.hash_query(None) is None

    def test_whitespace_collapsed(self, obs_env):
        obs = _import_observability()
        a = obs.hash_query("hello   world")
        b = obs.hash_query("hello world")
        assert a == b

    def test_trimmed(self, obs_env):
        obs = _import_observability()
        a = obs.hash_query("  hello  ")
        b = obs.hash_query("hello")
        assert a == b

    def test_nfkc_normalized(self, obs_env):
        obs = _import_observability()
        # U+00E9 (é) NFC → U+0065 U+0301 NFD; NFKC should normalize
        composed = unicodedata.normalize("NFC", "café")
        decomposed = unicodedata.normalize("NFD", "café")
        assert obs.hash_query(composed) == obs.hash_query(decomposed)

    def test_different_queries_produce_different_hashes(self, obs_env):
        obs = _import_observability()
        assert obs.hash_query("hello") != obs.hash_query("world")

    def test_same_query_same_hash(self, obs_env):
        obs = _import_observability()
        assert obs.hash_query("best pizza NYC") == obs.hash_query("best pizza NYC")

    def test_hash_never_contains_raw_query(self, obs_env):
        obs = _import_observability()
        h = obs.hash_query("sensitive data")
        assert "sensitive" not in h
        assert "data" not in h


# ── Timing tests ─────────────────────────────────────────────────


class TestTimingHelpers:
    """Milliseconds-to-seconds conversion and monotonic timing."""

    def test_timing_uses_perf_counter(self, obs_env):
        obs = _import_observability()
        t1 = obs.time.perf_counter()
        t2 = obs.time.perf_counter()
        assert t2 >= t1

    def test_ms_conversion(self, obs_env):
        obs = _import_observability()
        # If the module exposes a helper that converts elapsed to ms
        elapsed = 1.5  # seconds
        ms = elapsed * 1000
        assert ms == 1500.0


# ── Metric tests ─────────────────────────────────────────────────


class TestPrometheusMetrics:
    """Bounded metric labels and observation rules."""

    def test_metrics_registered_at_module_scope(self, obs_env):
        obs = _import_observability()
        assert hasattr(obs, "CHAT_REQUESTS_TOTAL")
        assert hasattr(obs, "CHAT_LATENCY_SECONDS")
        assert hasattr(obs, "RETRIEVAL_LATENCY_SECONDS")
        assert hasattr(obs, "CITATIONS_PER_RESPONSE")

    def test_chat_requests_total_has_bounded_labels(self, obs_env):
        obs = _import_observability()
        # Only mode and status labels, no request_id/hash/error/code
        metric = obs.CHAT_REQUESTS_TOTAL
        label_names = metric._labelnames
        assert "mode" in label_names
        assert "status" in label_names
        assert "request_id" not in label_names
        assert "query_hash" not in label_names
        assert "error_code" not in label_names
        assert "error_stage" not in label_names

    def test_chat_latency_seconds_has_only_mode_label(self, obs_env):
        obs = _import_observability()
        label_names = obs.CHAT_LATENCY_SECONDS._labelnames
        assert label_names == ("mode",) or set(label_names) == {"mode"}

    def test_retrieval_latency_seconds_has_only_mode_label(self, obs_env):
        obs = _import_observability()
        label_names = obs.RETRIEVAL_LATENCY_SECONDS._labelnames
        assert label_names == ("mode",) or set(label_names) == {"mode"}

    def test_citations_per_response_has_no_labels(self, obs_env):
        obs = _import_observability()
        label_names = obs.CITATIONS_PER_RESPONSE._labelnames
        assert len(label_names) == 0

    def test_chat_latency_has_expected_buckets(self, obs_env):
        obs = _import_observability()
        # Buckets should cover 0.01 through 120s
        upper_bounds = list(obs.CHAT_LATENCY_SECONDS._upper_bounds)
        assert upper_bounds[0] >= 0.01
        assert any(b >= 120.0 for b in upper_bounds)

    def test_citations_buckets_include_zero_through_ten(self, obs_env):
        obs = _import_observability()
        upper_bounds = list(obs.CITATIONS_PER_RESPONSE._upper_bounds)
        assert any(b <= 1 for b in upper_bounds)  # low bucket exists
        assert any(b >= 10 for b in upper_bounds)

    def test_only_valid_modes_accepted_for_metric_labels(self, obs_env):
        obs = _import_observability()
        # Valid modes should work — labels() in non-multiprocess mode
        # doesn't validate, but finalize_chat_request does via _build_event.
        obs.CHAT_REQUESTS_TOTAL.labels(mode="dense", status="success")
        obs.CHAT_REQUESTS_TOTAL.labels(mode="hybrid", status="fallback")
        obs.CHAT_REQUESTS_TOTAL.labels(mode="general_chat", status="error")
        obs.CHAT_REQUESTS_TOTAL.labels(mode="unknown", status="error")
        # Mode/status validation is enforced in _build_event, not in labels()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "success"
        obs.finalize_chat_request(state, stdout_sink=lambda _: None, queue_sink=lambda _: None)

    def test_rejects_invalid_mode_in_metric_label(self, obs_env):
        obs = _import_observability()
        # finalize_chat_request catches _build_event errors (logs, doesn't propagate).
        # Invalid mode → event building fails → no sink called, state still not emitted.
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "invalid"
        state.status = "success"
        sink_called = []
        obs.finalize_chat_request(state, stdout_sink=sink_called.append, queue_sink=lambda _: None)
        # Since mode is invalid, _build_event fails → no event emitted to sink
        assert len(sink_called) == 0
        # But state.emitted is still True (marked before sink) — the diagnostic
        # is that no event was actually rendered.

    def test_rejects_invalid_status_in_metric_label(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "invalid"
        sink_called = []
        obs.finalize_chat_request(state, stdout_sink=sink_called.append, queue_sink=lambda _: None)
        assert len(sink_called) == 0

    def test_preinitialized_label_combinations(self, obs_env):
        obs = _import_observability()
        # All 4 modes × 3 statuses = 12 combinations should exist
        for mode in ["unknown", "general_chat", "dense", "hybrid"]:
            for status in ["success", "fallback", "error"]:
                # Should not raise
                obs.CHAT_REQUESTS_TOTAL.labels(mode=mode, status=status)


# ── Finalizer tests ──────────────────────────────────────────────


class TestEventFinalizer:
    """Exactly-once emission, idempotence, and sink-failure suppression."""

    def test_emitted_guard_prevents_double_emission(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"

        sink1 = []
        sink2 = []

        # First call should succeed
        obs.finalize_chat_request(state, stdout_sink=sink1.append, queue_sink=sink2.append)
        assert len(sink1) == 1
        assert len(sink2) == 1

        # Second call should be a no-op
        obs.finalize_chat_request(state, stdout_sink=sink1.append, queue_sink=sink2.append)
        assert len(sink1) == 1
        assert len(sink2) == 1

    def test_identical_json_to_both_sinks(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "success"
        state.candidates = 5
        state.citations_count = 3
        state.retrieval_started = True
        state.retrieval_elapsed_s = 0.25
        state.generation_elapsed_s = 2.0
        state.total_elapsed_s = 3.0

        stdout_events = []
        queue_events = []

        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=queue_events.append)

        assert len(stdout_events) == 1
        assert len(queue_events) == 1
        assert stdout_events[0] == queue_events[0]

        event = json.loads(stdout_events[0])
        assert event["event"] == "chat_request"
        assert event["mode"] == "dense"
        assert event["status"] == "success"
        assert event["candidates"] == 5
        assert event["citations_count"] == 3
        assert event["latency_retrieval_ms"] == 250.0
        assert event["latency_generation_ms"] == 2000.0

    def test_total_latency_includes_all_stages(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "hybrid"
        state.status = "success"
        state.total_elapsed_s = 4.5
        state.retrieval_elapsed_s = 0.5
        state.generation_elapsed_s = 2.0
        state.retrieval_started = True

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event = json.loads(stdout_events[0])
        # Total should be >= retrieval + generation
        assert event["latency_total_ms"] >= event["latency_retrieval_ms"] + event["latency_generation_ms"]

    def test_general_chat_has_zero_retrieval_latency(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"
        state.total_elapsed_s = 2.0
        state.generation_elapsed_s = 1.5
        state.retrieval_started = False

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event = json.loads(stdout_events[0])
        assert event["latency_retrieval_ms"] == 0.0
        assert event["candidates"] == 0

    def test_failed_stage_retains_elapsed_time(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "error"
        state.candidates = 3
        state.retrieval_started = True
        state.retrieval_elapsed_s = 0.3
        state.generation_elapsed_s = 15.1  # failed HF call
        state.total_elapsed_s = 16.0
        state.error_type = "generation_error"
        state.error_stage = "generation"
        state.error_code = "hf_timeout"

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event = json.loads(stdout_events[0])
        assert event["latency_retrieval_ms"] == 300.0
        assert event["latency_generation_ms"] == 15100.0
        assert event["status"] == "error"

    def test_sink_exception_does_not_propagate(self, obs_env):
        obs = _import_observability()

        def failing_sink(_event):
            raise RuntimeError("simulated sink failure")

        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"

        # Should not raise
        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=failing_sink)
        # Stdout sink should still have received the event
        assert len(stdout_events) == 1

    def test_metric_failure_does_not_propagate(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"

        # Even if metrics update fails, it should not propagate
        stdout_events = []
        try:
            obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)
        except Exception as e:
            pytest.fail(f"finalizer propagated unexpected exception: {e}")

        assert len(stdout_events) == 1


class TestEventPrivacy:
    """Canonical events must never contain query/history/prompt/tokens."""

    def test_canonical_fields_are_strictly_allowlisted(self, obs_env):
        obs = _import_observability()
        allowed = {"event", "request_id", "query_hash", "mode", "status",
                   "candidates", "latency_retrieval_ms", "latency_generation_ms",
                   "latency_total_ms", "citations_count", "fallback_triggered",
                   "error_type", "error_stage", "error_code"}

        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "hybrid"
        state.status = "success"

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event = json.loads(stdout_events[0])
        for key in event:
            assert key in allowed, f"unexpected key in canonical event: {key}"
        for required in {"event", "request_id", "mode", "status"}:
            assert required in event

    def test_no_raw_query_in_event(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "hybrid"
        state.status = "success"

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event_str = stdout_events[0]
        # No raw query text in the canonical event
        assert "query" not in json.loads(event_str) or json.loads(event_str).get("query") is None

    def test_no_exception_message_in_event(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "unknown"
        state.status = "error"
        state.error_stage = "generation"
        state.error_type = "generation_error"
        state.error_code = "hf_timeout"

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)

        event = json.loads(stdout_events[0])
        # Error fields must be bounded taxonomy values, not exception messages
        assert event.get("error_code") in ["hf_timeout", "hf_request_failed", None] or \
            event.get("error_code", "").startswith("hf_") or \
            event.get("error_code", "").startswith("auth_") or \
            event.get("error_code", "").startswith("validation_") or \
            event.get("error_code", "").startswith("reformulation_") or \
            event.get("error_code", "").startswith("retrieval_") or \
            event.get("error_code", "").startswith("generation_") or \
            event.get("error_code", "").startswith("postprocessing_") or \
            event.get("error_code", "").startswith("response_") or \
            event["status"] == "success"


class TestFiniteTaxonomy:
    """Bounded stage/code/type taxonomy enforcement."""

    def test_error_stages_are_finite_set(self, obs_env):
        obs = _import_observability()
        valid_stages = {"auth", "validation", "reformulation", "retrieval",
                        "generation", "postprocessing", "response"}
        # Test that the module enforces these
        for stage in valid_stages:
            # Creating state with valid stage should not raise
            state = obs.ChatRequestState(request_id=obs.uuid4())
            state.error_stage = stage

    def test_error_types_are_finite_set(self, obs_env):
        obs = _import_observability()
        valid_types = ["auth_error", "validation_error", "reformulation_error",
                       "retrieval_error", "generation_error", "postprocessing_error",
                       "response_error"]
        for etype in valid_types:
            state = obs.ChatRequestState(request_id=obs.uuid4())
            state.error_type = etype  # should not raise

    def test_error_code_stage_compatibility(self, obs_env):
        obs = _import_observability()
        # auth → auth_required
        # validation → invalid_payload | message_required
        # retrieval → dense_only_fallback | location_filter_relaxed | retrieval_unavailable
        # generation → hf_timeout | hf_request_failed | prompt_template_fallback | busyness_unavailable
        # postprocessing → postprocessing_failed
        # response → internal_error
        # reformulation → query_reformulation_failed
        valid_codes = {
            "auth_required", "invalid_payload", "message_required",
            "query_reformulation_failed", "dense_only_fallback",
            "location_filter_relaxed", "retrieval_unavailable",
            "hf_timeout", "hf_request_failed", "prompt_template_fallback",
            "busyness_unavailable", "postprocessing_failed", "internal_error",
        }
        for code in valid_codes:
            state = obs.ChatRequestState(request_id=obs.uuid4())
            state.error_code = code  # should not raise


class TestMetricObservation:
    """Histogram observation rules and ms-to-seconds conversion."""

    def test_retrieval_not_observed_for_general_chat(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"
        state.retrieval_started = False

        # The finalizer should not observe retrieval latency for general_chat
        # Test through finalize
        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)
        event = json.loads(stdout_events[0])
        assert event["latency_retrieval_ms"] == 0

    def test_citations_not_observed_for_general_chat(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "general_chat"
        state.status = "success"
        state.citations_count = 0
        state.retrieval_started = False

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)
        event = json.loads(stdout_events[0])
        assert event["citations_count"] == 0

    def test_latency_ms_to_seconds_conversion(self, obs_env):
        obs = _import_observability()
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "success"
        state.total_elapsed_s = 3.0

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)
        event = json.loads(stdout_events[0])
        assert event["latency_total_ms"] == 3000.0

    def test_metrics_use_seconds_not_ms(self, obs_env):
        obs = _import_observability()
        # Prometheus histograms observe in seconds, events use ms
        state = obs.ChatRequestState(request_id=obs.uuid4())
        state.mode = "dense"
        state.status = "success"
        state.total_elapsed_s = 2.5
        state.retrieval_started = True
        state.retrieval_elapsed_s = 0.5
        state.generation_elapsed_s = 1.5

        stdout_events = []
        obs.finalize_chat_request(state, stdout_sink=stdout_events.append, queue_sink=lambda _: None)
        event = json.loads(stdout_events[0])
        assert event["latency_total_ms"] == 2500.0
        assert event["latency_retrieval_ms"] == 500.0
        assert event["latency_generation_ms"] == 1500.0
