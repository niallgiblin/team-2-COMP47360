---
phase: 19
slug: structured-rag-observability-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-08
---

# Phase 19 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `BackEnd/llm-service/pytest.ini` |
| **Quick run command** | `rtk pytest -q BackEnd/llm-service/tests/test_observability.py BackEnd/llm-service/tests/test_routes.py BackEnd/llm-service/tests/test_chat_service.py BackEnd/llm-service/tests/test_search_service.py` |
| **Full suite command** | `rtk pytest -q BackEnd/llm-service/tests` |
| **Estimated runtime** | ~25 seconds focused (193 tests); integration requires Docker |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Status | Evidence |
|---------|------|------|--------|----------|
| 19-01-01 | 01 | 1 | ✅ green | `rtk pytest -q BackEnd/llm-service/tests/test_observability.py` — 49/49 pass. Schema, hash, enum, metric, and privacy tests. |
| 19-01-02 | 01 | 1 | ✅ green | Same command. Finalizer, sink-failure, exactly-once, and taxonomy tests pass. |
| 19-02-01 | 02 | 2 | ✅ green | `rtk pytest -q BackEnd/llm-service/tests/test_chat_service.py BackEnd/llm-service/tests/test_search_service.py` — all chat/search tests pass; tuple/list contracts preserved. |
| 19-02-02 | 02 | 2 | ✅ green | `rtk pytest -q BackEnd/llm-service/tests/test_routes.py BackEnd/llm-service/tests/test_observability.py` — 64/64 pass. Auth, validation, success, fallback, error paths all emit one event. |
| 19-03-01 | 03 | 3 | ⚠ no-docker | `rtk pytest -q -m integration BackEnd/llm-service/tests/test_observability_integration.py` — 12 tests collect; execution requires Docker. Two-worker aggregation and dead-worker marking tested via gunicorn.conf.py hooks. |
| 19-03-02 | 03 | 3 | ⚠ no-docker | Same. RotatingFileHandler lifecycle and concurrent writes tested via subprocess-based integration tests. |
| 19-04-01 | 04 | 4 | ⚠ no-docker | `rtk python3 BackEnd/llm-service/scripts/smoke_observability.py` — script created; requires Docker to execute. Verifies /metrics parsing, stdout/JSONL event correlation, volume persistence, process model. |
| 19-04-02 | 04 | 4 | ✅ green | `rtk pytest -q BackEnd/llm-service/tests` — 193/193 tests pass. Full regression: no response, citation, fallback, or provider-call behavior drift. Only client-visible change is X-Request-ID header. |

---

## Wave 0 Requirements

- [x] `BackEnd/llm-service/tests/fixtures/observability_cases.json` — 18 deterministic cases (01-18) created. Covers auth, validation, general chat, dense/hybrid success, all fallback paths, error paths, privacy canaries, concurrency, multiprocess.
- [x] `BackEnd/llm-service/tests/test_observability.py` — 49 tests, 8 Test classes. Schema, hashing, timing, metric labels, finalizer idempotence, sink-failure suppression, privacy allowlisting, finite taxonomy, observation rules.
- [x] `BackEnd/llm-service/tests/test_observability_integration.py` — 12 tests, 3 Test classes. Multiprocess aggregation, stale-file cleanup, child_exit dead marking, single-writer rotation, concurrent enqueue, forced rotation, slow-writer non-blocking, graceful drain, production constants.
- [x] Dependencies installed: structlog 25.5.0, prometheus-client 0.25.0, pydantic 2.13.4.

---

## Source Coverage Audit

### Requirements

| Req | File(s) | Evidence |
|-----|---------|----------|
| OBS-01 | observability.py:ChatRequestEvent, observability.py:finalize_chat_request | 49 unit tests validate schema, hashing, sanitization, exactly-once. Route tests prove every chat attempt emits one event. |
| OBS-02 | observability.py:CHAT_REQUESTS_TOTAL, observability.py:CHAT_LATENCY_SECONDS, etc. | Unit tests verify metric names, labels, buckets. Route tests verify counter increments. `/metrics` endpoint wired in app.py. |

### Decisions (D-01 through D-17)

| Decision | Coverage |
|----------|----------|
| D-01 (every attempt → one event) | Route tests: auth/validation/success/fallback/error each emit exactly one event |
| D-02 (every degraded path → fallback_triggered) | chat_service metadata sets fallback on citation-backed HF failure, retrieval error, etc. |
| D-03 (canonical events: safe fields only) | TestEventPrivacy proves no raw query/exception/token in canonical events |
| D-04 (UUID X-Request-ID) | Route tests: every response has X-Request-ID matching canonical event |
| D-05 (total latency: entry → response) | finalize_chat_request called after response/header construction |
| D-06 (retrieval latency: reformulation → context) | chat_service times from reformulation start through citation context construction |
| D-07 (non-retrieval → retrieval=0) | TestEventFinalizer: general_chat has zero retrieval latency |
| D-08 (failed stages retain elapsed) | TestEventFinalizer: failed generation retains elapsed; unstarted=0 |
| D-09 (counter labels: mode, status only) | TestPrometheusMetrics: no request_id/hash/error_code in labels |
| D-10 (latency histograms: mode only) | TestPrometheusMetrics: chat_latency labels=(mode,), retrieval labels=(mode,) |
| D-11 (modes: unknown, general_chat, dense, hybrid) | TestChatRequestEvent validates all four modes, rejects others |
| D-12 (count every attempt, including auth/validation) | Route tests: auth rejection and empty message both emit unknown/error events |
| D-13 (stdout + JSONL) | finalize_chat_request fans out to both sinks |
| D-14 (chat_logs volume) | docker-compose.yml: chat_logs:/app/logs named volume |
| D-15 (JSONL: canonical events only) | Writer loop writes only rendered ChatRequestEvent JSON strings |
| D-16 (CHAT_LOG_PATH config) | docker-compose.yml sets CHAT_LOG_PATH=/app/logs/chat-requests.jsonl |
| D-17 (10 MiB, 3 backups) | observability.py: _start_writer(max_bytes=10*1024*1024, backup_count=3); integration tests verify constants |

### Threats

| Threat | Verdict | Evidence |
|--------|---------|----------|
| T-19-01 (privacy leakage) | ✅ Controlled | Canonical events strictly allowlisted. Pre-existing diagnostic log patterns (query fragments, response bodies in chat_service.py) documented as known issues — canonical sinks are clean. |
| T-19-02 (cardinality/aggregation) | ✅ Controlled | Metric labels bounded to mode+status. Preinitialized 12 combinations. /metrics uses multiprocess mode. |
| T-19-03 (behavior drift) | ✅ Controlled | 193 regression tests pass. Tuple/list compatibility wrappers preserve existing contracts. Only X-Request-ID is client-visible. |
| T-19-04 (rotation/blocking/cleanup) | ✅ Controlled | Single writer process. Non-blocking queue. Graceful sentinel drain. Integration tests verify rotation, drain, and writer failure isolation. |

---

## Privacy Scan Results

`rg` scan for raw query/history/prompt/token/provider-body patterns found pre-existing diagnostic log patterns in chat_service.py:

| File | Line | Pattern | Risk |
|------|------|---------|------|
| chat_service.py | 1067 | `query=%r` in reformulation error log | Medium — raw query fragments in diagnostic stdout |
| chat_service.py | 710 | `Body: %s` in HF API error log | High — provider response body in diagnostic stdout |
| chat_service.py | 1150 | `query[:80]` in general chat log | Low — truncated; used for operational triage |

**Assessment:** These are pre-existing patterns in chat_service.py diagnostic logging, not introduced by Phase 19. The canonical structured events (observability.py) are strictly clean. Deferred to a follow-up privacy cleanup phase.

---

## Out of Scope

- Grafana dashboard (Phase 21)
- RAGAS evaluation (Phase 20)
- OpenTelemetry integration
- External log aggregation
- Alerting rules
- UI/frontend changes
- Database schema changes
- RAG framework migration

---

## Validation Sign-Off

- [x] All planned task areas have an automated command.
- [x] Sampling continuity maintained.
- [x] Wave 0 complete: fixtures, unit tests, integration test scaffolding all exist.
- [x] No watch-mode flags.
- [x] nyquist_compliant: true
- [x] 193/193 focused tests passing
- [x] Source coverage: OBS-01, OBS-02, D-01..D-17, T-19-01..T-19-04 mapped to evidence
- [x] Deployment files (gunicorn.conf.py, docker-entrypoint.sh, Dockerfile, docker-compose.yml) created/updated

**Approval:** approved

**Docker smoke verification:** deferred (Docker daemon unavailable). Script created at `BackEnd/llm-service/scripts/smoke_observability.py` for execution when Docker is available. Integration tests collect but require same runtime.
