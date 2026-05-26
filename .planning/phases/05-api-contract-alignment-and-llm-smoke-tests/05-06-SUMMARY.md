---
phase: 05-api-contract-alignment-and-llm-smoke-tests
plan: 06
subsystem: api
tags: [spring, resttemplate, ml-client, maintainability, contract-tests, vibe-service]

requires:
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    plan: 03
    provides: MlResponseMapper, typed DTO wiring, similar source indicator
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    plan: 05
    provides: Fixture-driven VibeService contract tests and classpath fixtures
provides:
  - MlServiceClient for isolated ML HTTP calls (/search, /similar, /busyness, /health)
  - Slimmed VibeService retaining caches, enrichment, and orchestration only
  - MlServiceClientTest with URL path and payload assertions
affects:
  - Phase 7/10 cache extraction (caches remain in VibeService per D-17)
  - Future ML contract testing without VibeService monolith

tech-stack:
  added: []
  patterns:
    - "MlServiceClient @Service owns RestTemplate.exchange to ML endpoints"
    - "VibeService injects MlServiceClient + MlResponseMapper; no direct ML HTTP"
    - "MlServiceClientTest mocks RestTemplate; VibeServiceTest mocks MlServiceClient"

key-files:
  created:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/service/MlServiceClient.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/service/MlServiceClientTest.java
  modified:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/service/VibeService.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/service/VibeServiceTest.java

key-decisions:
  - "Caches (searchCache, busynessCache, cachedMapData) stay in VibeService per D-17"
  - "MlServiceClient injects shared RestTemplate bean from SecurityConfig"
  - "VibeServiceTest mocks MlServiceClient at orchestration layer; HTTP contract tests live in MlServiceClientTest"

patterns-established:
  - "mlServiceClient.search/findSimilar/fetchBusynessReport/isLlmServiceAvailable delegation"
  - "ArgumentCaptor on findSimilar payload in VibeServiceTest; URL assertions in MlServiceClientTest"

requirements-completed: [MAINT-03, API-03]

duration: 4min
completed: 2026-05-26
---

# Phase 5 Plan 06: MlServiceClient Extraction Summary

**MlServiceClient owns typed ML HTTP calls; VibeService retains caches and business assembly with isolated client unit tests satisfying MAINT-03.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-26T17:39:00Z
- **Completed:** 2026-05-26T17:43:26Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `MlServiceClient` with typed `search`, `findSimilar`, `fetchBusynessReport`, and `isLlmServiceAvailable` methods using `MlSearchResponse` and `BusynessReportDto`.
- Refactored `VibeService` to delegate all ML HTTP to the client while preserving caches, DB enrichment, and `buildSimilarPayload`.
- Added `MlServiceClientTest` (5 tests) asserting `/search`, `/similar`, `/busyness`, and `/health` URLs with contract fixtures; updated `VibeServiceTest` to mock `MlServiceClient`.

## Task Commits

1. **Task 1: Create MlServiceClient with typed HTTP methods** — `31e3fbe0` (feat)
2. **Task 2: Refactor VibeService to delegate HTTP to client** — `a050a9c6` (feat)
3. **Task 3: Add MlServiceClientTest** — `d9485d9f` (test)

## Verification Commands

```bash
cd BackEnd && mvn compile -q
cd BackEnd && mvn test -Dtest=VibeServiceTest,VibeControllerTest -q
cd BackEnd && mvn test -Dtest=MlServiceClientTest,MlContractTest,VibeServiceTest -q
cd BackEnd && mvn test -Dtest=MlServiceClientTest,MlContractTest,VibeServiceTest,VibeControllerTest,SecurityBoundaryTest -q
```

All commands exit 0 at completion.

## Files Created/Modified

- `MlServiceClient.java` — `@Service` ML HTTP client with log-and-null error handling
- `VibeService.java` — removed RestTemplate/URL fields; injects MlServiceClient
- `MlServiceClientTest.java` — mocked RestTemplate URL, payload, and fixture deserialization tests
- `VibeServiceTest.java` — mocks MlServiceClient; payload captor on findSimilar orchestration

## Decisions Made

- Caches remain in VibeService until Phase 7/10 per D-17 minimal split guardrail.
- VibeService uses constructor injection for MlServiceClient (matches existing pattern).
- Error handling preserved: client logs and returns null; VibeService maps to empty collections.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- MAINT-03 Java ML client/mapper/assembly split complete for HTTP layer.
- Phase 5 Java gate green; pytest/Vitest tiers unchanged by this plan.
- Cache extraction to dedicated service deferred to Phase 7/10.

## Self-Check: PASSED

- `BackEnd/src/main/java/com/manhattan/busyness_predictor/service/MlServiceClient.java` — FOUND
- `BackEnd/src/test/java/com/manhattan/busyness_predictor/service/MlServiceClientTest.java` — FOUND
- `05-06-SUMMARY.md` — FOUND
- Commits `31e3fbe0`, `a050a9c6`, `d9485d9f` — FOUND in git log

---
*Phase: 05-api-contract-alignment-and-llm-smoke-tests*
*Completed: 2026-05-26*
