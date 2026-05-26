---
phase: 05-api-contract-alignment-and-llm-smoke-tests
verified: 2026-05-26T20:34:30Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 1
overrides:
  - truth: "MAINT-02: FindMyVibe.jsx API calls, enrichment, and caching extracted into focused modules with tests"
    status: accepted_descope
    reason: "Phase 5 scoped MAINT-02 to chatAPI boundary per D-18 and roadmap work-outline 'only as needed to make contracts testable'; FindMyVibe search contract was not broken."
gaps: []
---

# Phase 5: API Contract Alignment and LLM Smoke Tests — Verification Report

**Phase Goal:** Make frontend, Spring, and LLM Flask service contracts agree and stay tested.
**Verified:** 2026-05-26T20:34:30Z
**Status:** passed
**Re-verification:** Yes — after 05-07 cold-start gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Similar-location requests no longer rely on an unimplemented endpoint | ✓ VERIFIED | Flask `POST /similar` at `app.py:428`; Spring `buildSimilarPayload` posts venue fields via `MlServiceClient.findSimilar` |
| 2 | Chat history preserved across frontend and Flask contract tests | ✓ VERIFIED | `chatAPI.sendMessage` sends `previous_questions`; Vitest 3 chat tests green; pytest `test_chat_accepts_previous_questions_and_truncates` green |
| 3 | ML response shape changes fail typed tests instead of runtime casts | ✓ VERIFIED | `MlContractTest` (9 tests), `MlServiceClientTest` (5 tests) deserialize fixtures to DTOs; no raw Map casting in `VibeService`/`MlServiceClient` ML paths |
| 4 | LLM smoke tests run locally without live Hugging Face calls | ✓ VERIFIED | `conftest.py` monkeypatches numpy/pandas/torch/sentence_transformers; `.venv-test/bin/python -m pytest tests/ -q` → 18 passed |
| 5 | Shared ML contract fixtures exist with README glossary | ✓ VERIFIED | `BackEnd/contract-fixtures/` (5 files) mirrored to `src/test/resources/contract-fixtures/` (4 JSON files) |
| 6 | Spring similar flow POSTs venue fields and exposes `source` indicator | ✓ VERIFIED | `VibeService.buildSimilarPayload` puts name/zone/loc_type/limit; `VibeControllerTest` asserts `$.source` is `ml` or `category` |
| 7 | Java Spring-to-Flask contract tests cover search, similar, busyness, forecast shapes | ✓ VERIFIED | `MlServiceClientTest` mocks RestTemplate for `/search`, `/similar`, `/busyness`; `MlContractTest.mapBusynessFixtureToPredictionsAndForecast` covers forecast array |
| 8 | MlServiceClient owns ML HTTP; VibeService owns caches and assembly (MAINT-03) | ✓ VERIFIED | `MlServiceClient.java` has search/findSimilar/fetchBusynessReport/isLlmServiceAvailable; zero `RestTemplate` references in `VibeService.java` |
| 9 | MAINT-02: FindMyVibe API/enrichment/cache extracted into modules with tests | ✓ VERIFIED WITH OVERRIDE | Accepted descope: Phase 5 scoped MAINT-02 to chatAPI boundary per D-18 and roadmap work-outline "only as needed to make contracts testable"; FindMyVibe search contract was not broken |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `BackEnd/contract-fixtures/README.md` | Flask ↔ Java field glossary | ✓ VERIFIED | Documents search/similar/busyness/chat envelopes and field mapping |
| `BackEnd/contract-fixtures/llm/*.json` | Canonical ML response fixtures | ✓ VERIFIED | search-success, search-empty, similar-success present |
| `BackEnd/src/test/java/.../dto/MlContractTest.java` | Fixture deserialization + mapper tests | ✓ VERIFIED | 9 substantive tests, loads classpath fixtures |
| `BackEnd/llm-service/tests/test_routes.py` | Route smoke tests | ✓ VERIFIED | 7 tests for /health, /search, /similar, /api/chat |
| `BackEnd/llm-service/tests/conftest.py` | Stubbed load_app harness | ✓ VERIFIED | 168 lines; stubs heavy deps, no HF/LFS |
| `BackEnd/src/main/java/.../service/MlServiceClient.java` | Extracted ML HTTP client | ✓ VERIFIED | 163 lines; typed DTO responses |
| `BackEnd/src/test/java/.../service/MlServiceClientTest.java` | Isolated client tests | ✓ VERIFIED | 5 tests with fixture-backed mocks |
| `frontend/services/apiService.js` | chatAPI previous_questions adapter | ✓ VERIFIED | Lines 131–152 filter user messages → `previous_questions` |
| `frontend/services/tests/apiService.test.js` | Chat contract tests | ✓ VERIFIED | 23 tests passed including 3 chat contract tests |
| `frontend/src/pages/FindMyVibe.jsx` | MAINT-02 extraction target | ✓ ACCEPTED DESCOPE | No module extraction; accepted because Phase 5 fixed the broken chat contract boundary only |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `AIChatWidget.jsx` | `apiService.js` | `chatAPI.sendMessage(input, messages)` | ✓ WIRED | Import at line 2; call at line 52 |
| `apiService.js` | Flask `/api/chat` | `previous_questions` in POST body | ✓ WIRED | Vitest asserts body shape; Flask accepts field at `app.py:623` |
| `VibeService.fetchMLSimilarLocations` | Flask `POST /similar` | `MlServiceClient.findSimilar(venuePayload)` | ✓ WIRED | `buildSimilarPayload` → name/zone/loc_type/limit |
| `MlContractTest` | `contract-fixtures/` | ClassLoader resource stream | ✓ WIRED | Loads all 4 fixture paths |
| `test_routes.py` | `conftest.py` | `from conftest import _ready_chat_app` | ✓ WIRED | All route tests use shared harness |
| `VibeService` | `MlServiceClient` | constructor injection | ✓ WIRED | `mlServiceClient.search/findSimilar/fetchBusynessReport` delegation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `chatAPI.sendMessage` | `previous_questions` | Widget `messages` prop filtered by `sender==='user'` | Yes — maps `.text` strings | ✓ FLOWING |
| `VibeService.findSimilarLocations` | `source` | ML results non-empty → `"ml"`, else category fallback | Yes — conditional on `fetchMLSimilarLocations` result | ✓ FLOWING |
| `MlResponseMapper.toLocations` | `Location` list | `MlSearchResponse.results` DTO fields | Yes — fixture maps to entity with lat/lng/flags | ✓ FLOWING |
| `FindMyVibe.jsx` search | `allResults` | Direct `fetch(vibeAPI.searchUrl())` | Yes — but not extracted/tested per MAINT-02 | ⚠️ HOLLOW (for MAINT-02 scope) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| LLM route smoke tests (stubbed) | `cd BackEnd/llm-service && .venv-test/bin/python -m pytest tests/ -q` | 18 passed, 4 warnings | ✓ PASS |
| LLM Docker cold start | `docker compose build llm-service && docker compose up -d llm-service && docker compose exec -T llm-service curl -f http://localhost:5000/health` | Build exited 0; container `urban-gala-llm` is `running healthy`; health JSON returned initialized model/data/embeddings | ✓ PASS |
| Java contract tests | `cd BackEnd && ./mvnw test -Dtest=MlContractTest,MlServiceClientTest,VibeServiceTest,VibeControllerTest` | Exit 0 (tests executed; expected error log from null-on-failure test) | ✓ PASS |
| Frontend chat contract tests | `cd frontend && npm test -- --run services/tests/apiService.test.js` | 23 passed | ✓ PASS |
| Single route health check | `PYTHONPATH=. .venv-test/bin/python -m pytest tests/test_routes.py::test_health_returns_200_when_initialized` | 1 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| API-01 | 05-02, 05-03 | Similar-location Flask `/similar` or retarget Spring | ✓ SATISFIED | `/similar` implemented; Spring posts venue fields |
| API-02 | 05-01, 05-04 | Chat uses same history field as Flask `/api/chat` | ✓ SATISFIED | `previous_questions` in chatAPI + Vitest + pytest |
| API-03 | 05-01, 05-03, 05-06 | Java deserializes ML via typed DTOs | ✓ SATISFIED | `MlSearchResponse`, `BusynessReportDto`, `MlResponseMapper`; no Map casts on ML responses |
| API-05 | 05-01, 05-05 | Spring-to-Flask contract tests for payload shapes | ✓ SATISFIED | Search/similar/busyness/forecast in Java tests; chat documented in README + Flask/Vitest (Flask-only per D-12) |
| ML-01 | 05-01, 05-02 | LLM smoke tests for startup, /health, /search, /api/chat | ✓ SATISFIED | 18 pytest tests; `load_app` covers import without live models |
| MAINT-02 | 05-04 | FindMyVibe extraction into modules with tests | ✓ ACCEPTED DESCOPE | Phase 5 scoped MAINT-02 to chatAPI boundary per D-18; FindMyVibe search contract was not broken |
| MAINT-03 | 05-03, 05-06 | VibeService separates client, mapper, cache, assembly | ✓ SATISFIED | `MlServiceClient` + `MlResponseMapper`; caches remain in VibeService per D-17 |
| TEST-04 | 05-01, 05-02 | Python tests run without production models or live services | ✓ SATISFIED | conftest stubs all heavy imports; venv pytest green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `FindMyVibe.jsx` | 27–28 | Module-level `searchCache` Map | ℹ️ Info | Pre-existing; not introduced by phase; MAINT-02 target |
| `FindMyVibe.jsx` | 250 | `console.error` in catch | ℹ️ Info | Existing error logging; not a stub |

No blocker anti-patterns (TODO stubs, empty returns, unwired fetch) found in phase deliverables.

### Human Verification Required

None required for phase closure. Optional spot-checks if desired:

### 1. Multi-turn chat context in browser

**Test:** Open app, send 3+ chat messages, verify later replies reflect prior user questions.
**Expected:** Assistant responses show awareness of recent questions (server truncates to last 3).
**Why human:** Requires running frontend + LLM service with real JWT flow.

### 2. Similar locations ML source in UI

**Test:** Select a venue, request similar locations with LLM service running.
**Expected:** Response includes ML-powered results when service healthy; `source: ml` in API payload.
**Why human:** End-to-end Spring → Flask → UI path not exercised in automated spot-checks.

### Gaps Summary

Phase 5 achieves its core contract-alignment goal: `/similar` is implemented and wired, chat uses `previous_questions` end-to-end, Java ML parsing is typed and fixture-tested, LLM smoke tests run stubbed locally, and the Docker cold-start `jwt` blocker is resolved.

No gaps remain after applying the documented MAINT-02 descope override and executing 05-07 cold-start gap closure.

---

_Verified: 2026-05-26T20:34:30Z_
_Verifier: Codex (gsd-execute-phase re-verification)_
