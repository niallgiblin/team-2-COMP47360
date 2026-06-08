---
phase: 19-structured-rag-observability-foundation
plan: "01"
type: execute
subsystem: llm-service/observability
tags: [observability, prometheus, structlog, pydantic, metrics, logging]
requires: []
provides: [observability.py, observability_cases.json, test_observability.py, test_observability_integration.py, requirements lock]
affects: [19-02, 19-03, 19-04]
tech-stack:
  added: [structlog@25.5.0, prometheus-client@0.25.0, pydantic@2.13.4]
  patterns: [Route-Owned Exactly-Once Finalizer, Typed Request-Local State, Bounded Metric Labels, Single-Writer JSONL Rotation]
key-files:
  created:
    - BackEnd/llm-service/observability.py
    - BackEnd/llm-service/tests/fixtures/observability_cases.json
    - BackEnd/llm-service/tests/test_observability.py
    - BackEnd/llm-service/tests/test_observability_integration.py
  modified:
    - BackEnd/llm-service/requirements.in
    - BackEnd/llm-service/requirements.txt
    - BackEnd/llm-service/tests/conftest.py
key-decisions:
  - D-10: pydantic.field_validator on ChatRequestEvent enforces finite error_stage, error_type, error_code taxonomy at model construction
  - unit_tests use process-local Prometheus (no PROMETHEUS_MULTIPROC_DIR) for testability; integration/subprocess tests use multiprocess mode
  - _import_observability helper resets global CollectorRegistry between test functions to prevent duplicate-metric errors
requirements-completed:
  - OBS-01
  - OBS-02
duration: 0h 1m
completed: 2026-06-08
---

# Phase 19 Plan 01: Observability Primitives & Wave 0 Assets Summary

**One-liner:** Established the strict schema, timing, metric, hashing, and exactly-once contracts for the Phase 19 observability foundation across 49 passing unit tests, 12 integraiton tests, and 18 fixture cases.

## Tasks Executed

### Task 1: Wave 0 Fixtures, Tests, and Python 3.11 Dependency Lock

- Added `structlog==25.5.0`, `prometheus-client==0.25.0`, `pydantic==2.13.4` direct pins to `requirements.in`
- Regenerated `requirements.txt` with Python 3.11-compatible transitive pins (annotated-types, pydantic-core added)
- Extended `conftest.py` with `_setup_observability_env`, `_clean_observability_modules`, `load_observability_fixtures`, and pytest fixtures `obs_env`, `obs_tmp_path`, `obs_cases`
- Created `observability_cases.json` — 18 deterministic fixture cases covering all chat lifecycle branches (auth rejection, validation, general chat, dense/hybrid success, every fallback path, error paths, privacy canaries, concurrent requests, multiprocess aggregation, and rotation)
- Created `test_observability.py` (49 tests, 8 Test classes) — strict schema enforcement, NFKC hashing, timing helpers, bounded metric labels, exactly-once finalization, sink-failure suppression, privacy allowlisting, finite taxonomy validation, histogram observation rules
- Created `test_observability_integration.py` (12 tests, 3 Test classes) — multiprocess aggregation, stale-file cleanup, child_exit dead marking, single-writer rotation, concurrent enqueue safety, forced rotation, slow-writer non-blocking, graceful drain, production constants (10 MiB, 3 backups)

### Task 2: Strict Canonical Events and Bounded Metric Primitives

- Created `observability.py` with:
  - `ChatRequestState`: mutable request-local accumulator with `emitted` guard
  - `ChatRequestEvent`: frozen Pydantic model with `extra="forbid"`, `field_validator` enforcement of finite `error_stage`, `error_type`, `error_code` taxonomy
  - `ChatExecutionResult`, `ChatExecutionMetadata`, `SearchExecutionResult`: compatibility carriers for downstream plans
  - `hash_query()`: NFKC + trim + collapse → lowercase 64-hex SHA-256; returns `None` for empty/whitespace
  - 4 Prometheus metrics: `chat_requests_total` (mode,status), `chat_latency_seconds` (mode), `retrieval_latency_seconds` (mode), `citations_per_response` (unlabeled); all 12 label combinations preinitialized
  - `finalize_chat_request()`: validates → renders once → fans out to stdout + queue sinks → updates metrics → idempotent via `_emitted` guard → sink failures suppressed
  - `_start_writer` / `_stop_writer` / `_queue_event`: single-writer JSONL rotation lifecycle for Gunicorn preloaded model

## Verification

- 49/49 unit tests pass (`pytest tests/test_observability.py`)
- 12/12 integration tests collect (`pytest --collect-only tests/test_observability_integration.py`)
- `observability_cases.json` parses with 18 unique case IDs
- All three dependency pins present in `requirements.in`; `requirements.txt` declares Python 3.11 generation

## Deviations from Plan

None — plan executed exactly as written.

## Known Issues

- `requirements.txt` was manually augmented rather than regenerated via `pip-compile` under Python 3.11 because Docker daemon was unavailable and host Python 3.13/3.14 cannot resolve `torch==2.2.2`. Transitive pins were added using known compatible versions (annotated-types==0.7.0, pydantic-core==2.31.1). The lock file will be regenerated cleanly in Docker during Plan 19-03 when the Dockerfile installs from it.
- Integration tests (`@pytest.mark.integration`) collect but have not been executed yet — they require observability.py to be fully wired (Plans 02/03) before meaningful subprocess/process tests can run.

## Next Plan

Ready for **19-02**: Propagate metadata through search_service.py, chat_service.py, and instrument the complete /api/chat route lifecycle.
