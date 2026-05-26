---
phase: 05-api-contract-alignment-and-llm-smoke-tests
plan: 03
subsystem: api
tags: [spring, jackson, resttemplate, ml-dto, similar-locations, source-indicator]

requires:
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    plan: 01
    provides: Contract fixtures, Jackson DTO stubs, MlContractTest harness
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    plan: 02
    provides: Flask POST /similar with venue-field contract
provides:
  - MlResponseMapper for ML JSON to Location and busyness maps
  - VibeService typed RestTemplate calls for /search, /similar, busyness report
  - SimilarLocationsResult with source ml|category
  - Public /api/vibe/similar envelope includes source field
affects:
  - 05-04 (frontend chatAPI — independent)
  - Phase 6 busyness smoke (deeper busyness tests)

tech-stack:
  added: []
  patterns:
    - "MlResponseMapper @Component maps MlSearchResponse → Location without Map casts"
    - "Venue-field POST /similar payload (name, zone, loc_type, limit)"
    - "BusynessReportDto deserialization; empty predictions on parse failure (D-12)"
    - "source: ml|category on similar API when ML used vs category fallback"

key-files:
  created:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/service/MlResponseMapper.java
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/dto/SimilarLocationsResult.java
  modified:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/service/VibeService.java
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/controller/VibeController.java
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/dto/MlLocationDto.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/dto/MlContractTest.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/service/VibeServiceTest.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/VibeControllerTest.java

key-decisions:
  - "loc_type derived from Location.getType() (entity has no separate locType column)"
  - "MlResponseMapper introduced per MAINT-03 partial; full MlServiceClient extraction deferred"

patterns-established:
  - "RestTemplate.exchange(..., MlSearchResponse.class) for ML search and similar"
  - "ArgumentCaptor on similar POST asserts name/zone/limit and absence of locationId"

requirements-completed: [API-01, API-03]

duration: 15min
completed: 2026-05-26
---

# Phase 5 Plan 03: Spring ML DTO Wiring and Similar Source Summary

**Spring similar flow posts venue fields to Flask, deserializes typed ML/busyness DTOs via MlResponseMapper, and exposes `source: ml|category` on the public similar API.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-26T17:28:00Z
- **Completed:** 2026-05-26T17:39:45Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Implemented `MlResponseMapper` with `toLocations`, `toPredictions`, and `toForecast`; green `MlContractTest` against classpath fixtures.
- Refactored `VibeService` to use `MlSearchResponse` and `BusynessReportDto` (removed unchecked `Map` parsing for ML search/similar).
- Wired `POST /similar` with venue-field payload (`name`, `zone`, `loc_type`, optional `summary`/`tags`, `limit`).
- Added `SimilarLocationsResult` and top-level `source` on `/api/vibe/similar`; updated service and controller tests.

## Task Commits

1. **Task 1: Implement MlResponseMapper and complete DTO mapping tests** — `2f6a46ea` (feat)
2. **Task 2: Refactor VibeService ML calls to typed DTOs** — `be1806b4` (feat)
3. **Task 3: Add source to controller and update Java tests** — `a6d8f36a` (feat)

## Verification Commands

```bash
cd BackEnd && mvn test -Dtest=MlContractTest,VibeServiceTest,VibeControllerTest -q
```

All tests green at completion.

## Files Created/Modified

- `MlResponseMapper.java` — fixture-aligned ML → domain mapping, rating regex preserved
- `SimilarLocationsResult.java` — locations + source indicator
- `VibeService.java` — typed DTO calls, venue similar payload, DB enrichment
- `VibeController.java` — `source` in similar response envelope
- `MlLocationDto.java` — `@JsonAlias` for lat/long/addr/loc_type
- `MlContractTest.java`, `VibeServiceTest.java`, `VibeControllerTest.java` — contract and source assertions

## Decisions Made

- `loc_type` in similar payload uses `Location.getType()` derived from entity flags (no persisted `locType` field).
- Controller `source` field added in Task 3 commit; minimal compile fix for Task 2 kept controller change out of Task 2 commit scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- API-01 Spring side and API-03 Java ML parsing complete for search, similar, and minimal busyness report.
- Wave 3 frontend `chatAPI` (05-04) can proceed independently.
- Optional follow-up: extract `MlServiceClient` (MAINT-03 remainder) in a later phase.

## Self-Check: PASSED

- `MlResponseMapper.java` — FOUND
- `SimilarLocationsResult.java` — FOUND
- `05-03-SUMMARY.md` — FOUND
- Commits `2f6a46ea`, `be1806b4`, `a6d8f36a` — FOUND in git log

---
*Phase: 05-api-contract-alignment-and-llm-smoke-tests*
*Completed: 2026-05-26*
