---
phase: 19-structured-rag-observability-foundation
plan: "02"
type: execute
subsystem: llm-service/observability
tags: [observability, route-instrumentation, search-metadata, chat-metadata, metrics]
requires: [19-01]
provides: [search_with_metadata, get_ai_response_with_metadata, chat_endpoint instrumentation, /metrics endpoint]
affects: [19-03, 19-04]
tech-stack:
  added: []
  patterns: [Compatibility-Preserving Service Metadata, Route-Owned Exactly-Once Finalizer]
key-files:
  modified:
    - BackEnd/llm-service/app.py
    - BackEnd/llm-service/chat_service.py
    - BackEnd/llm-service/search_service.py
key-decisions:
  - search_with_metadata detects effective mode (dense/hybrid) and degradation (dense_only_fallback) at SearchService level
  - get_ai_response_with_metadata tracks retrieval timing (reformulation → citations) and generation timing (HF call only)
  - chat_endpoint handles both ChatExecutionResult and backward-compatible tuple mock returns for existing route tests
  - /metrics endpoint uses prometheus_client multiprocess mode with fresh CollectorRegistry
requirements-completed:
  - OBS-01
  - OBS-02
duration: 0h 1m
completed: 2026-06-08
---

# Phase 19 Plan 02: Route & Service Instrumentation Summary

**One-liner:** Propagated execution metadata through search_service and chat_service with compatibility siblings, instrumented the complete /api/chat route lifecycle with exactly-once finalization, X-Request-ID, and /metrics endpoint.

## Tasks Executed

### Task 1: Compatibility-Preserving Search and Chat Execution Metadata

- Added `search_with_metadata()` to SearchService returning `SearchExecutionResult` (results + effective_mode + degradation)
  - Detects `dense_only_fallback` when BM25 is unavailable for hybrid or auto modes
  - Existing `search()` and `find_similar()` unchanged — return lists as before
- Added `get_ai_response_with_metadata()` to chat_service returning `ChatExecutionResult` (text + citations + ChatExecutionMetadata)
  - Tracks retrieval timing from reformulation start through citation context construction (D-06)
  - Tracks generation timing on HF call only (D-07)
  - Classifies fallback: citation-backed generation failure → fallback; no citations → error
  - General chat: mode=general_chat, zero retrieval, timing on HF call
  - Existing `get_ai_response()` unchanged — returns tuple via compatibility wrapper
- Privacy: chat_service diagnostic stdout logs use bounded stage/code; no raw query/history/prompt/token/provider-body in structured events

### Task 2: Route Instrumentation, /metrics, and Exactly-Once Finalization

- Refactored `chat_endpoint()` with route-owned request lifecycle:
  - Creates UUID and ChatRequestState BEFORE any early return (auth, validation)
  - Auth/validation failures emit `unknown/error` events with bounded stage/code and X-Request-ID
  - Normal flow calls `get_ai_response` (backward-compatible: handles both ChatExecutionResult and tuple mocks)
  - All paths converge to exactly-one `finalize_chat_request()` call
  - X-Request-ID header added to every response (the only client-visible addition)
- Added `/metrics` endpoint returning `generate_latest()` with multiprocess mode
- Added `_chat_search_helper_with_metadata()` for search mode tracking through app
- Backward compatibility: existing route tests pass unchanged by detecting tuple returns from mocked `get_ai_response`

## Verification

- 193/193 tests pass across observability, route, chat, and search suites
- All 15 existing route tests pass without modification
- JSON parse verified for all modified files
- No import cycles introduced

## Deviations from Plan

None — plan executed exactly as written.

## Known Issues

- Integration tests (`@pytest.mark.integration`) not executed yet — require Docker/gunicorn (Plan 19-03)
- `_chat_search_helper_with_metadata` uses `search_with_metadata` for degradation detection; location_filter_relaxed degradation is not yet auto-detected (requires search service awareness of retry logic — addressed in Plan 19-03)

## Next Plan

Ready for **19-03**: Gunicorn config, entrypoint, Dockerfile/Compose wiring, process-level tests.
