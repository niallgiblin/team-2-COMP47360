---
phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
plan: 02
subsystem: api
tags: [caffeine, bbox, map-data, perf-05, maint-05, junit]

requires:
  - phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
    provides: Wave 0 bbox red tests and reflection helper from plan 10-01

provides:
  - GET /api/vibe/map-data optional bbox params with zone-filtered busyness/forecast
  - Caffeine busyness and bbox-keyed map-data caches with APP_VIBE_* env placeholders
  - Green bbox integration tests with D-15 location count evidence

affects:
  - 10-03-PLAN.md
  - 10-04-PLAN.md
  - frontend MapView bbox wiring

tech-stack:
  added: []
  patterns:
    - "mapDataCache keys: full or bbox:{4-decimal coords} mirroring frontend COORD_DECIMALS"
    - "Single ML busyness fetch per request; zone-filter busyness/forecast in memory for bbox"

key-files:
  created: []
  modified:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/repository/LocationRepository.java
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/controller/VibeController.java
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/service/VibeService.java
    - BackEnd/src/main/resources/application.properties
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/service/VibeServiceTest.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/VibeControllerTest.java

key-decisions:
  - "BBox cache keys round coordinates to 4 decimals for stable frontend parity"
  - "Busyness Caffeine cache holds single report entry with max size 2"
  - "Inverted bbox rejected via IllegalArgumentException (400 via GlobalExceptionHandler)"

patterns-established:
  - "Viewport map-data: repository bbox query + zone-keyed busyness subset (D-03)"

requirements-completed: [PERF-05, MAINT-05]

duration: 12min
completed: 2026-05-28
---

# Phase 10 Plan 02: Backend Bbox Map-Data and Caffeine Caches Summary

**Viewport bbox filtering on GET /api/vibe/map-data with zone-scoped busyness maps and Caffeine-backed busyness/map-data caches keyed by full or 4-decimal bbox coordinates**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-28T13:48:00Z
- **Completed:** 2026-05-28T14:00:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `findByLatBetweenAndLngBetween` repository query and optional controller bbox params (PERF-05 / D-01, D-02)
- Zone-filtered busyness and forecast for bbox responses; inverted box validation (D-03)
- Migrated busyness and map-data singleton caches to Caffeine with `APP_VIBE_*` properties (MAINT-05 / D-08)
- Turned plan 10-01 bbox red tests green with D-15 evidence: **N_full=3, N_bbox=1**

## Task Commits

Each task was committed atomically:

1. **Task 1: Bbox repository, controller params, and VibeService filtering** - `ddb25669` (feat)
2. **Task 2: Caffeine busyness and map-data caches + properties** - `76b046c6` (feat)
3. **Task 3: Regression pass and map-data cache hit test update** - `7b37f8b5` (test)

## Files Created/Modified

- `BackEnd/src/main/java/com/manhattan/busyness_predictor/repository/LocationRepository.java` - `findByLatBetweenAndLngBetween` derived query
- `BackEnd/src/main/java/com/manhattan/busyness_predictor/controller/VibeController.java` - Optional bbox `@RequestParam` forwarding
- `BackEnd/src/main/java/com/manhattan/busyness_predictor/service/VibeService.java` - Bbox overload, zone filtering, Caffeine caches
- `BackEnd/src/main/resources/application.properties` - `app.vibe.busyness-cache.*` and `app.vibe.map-data-cache.*`
- `BackEnd/src/test/java/com/manhattan/busyness_predictor/service/VibeServiceTest.java` - Green bbox tests, cache reflection/hit tests
- `BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/VibeControllerTest.java` - Bbox forwarding and inverted-bbox tests

## Decisions Made

- Bbox cache keys use 4-decimal coordinate rounding aligned with frontend `COORD_DECIMALS`
- Busyness cache uses single `"report"` key with Caffeine max size 2
- Omitted any bbox param falls back to full-corpus path (backward compatible)

## Deviations from Plan

None - plan executed exactly as written.

## D-15 Location Count Evidence

| Test | N_full | N_bbox |
|------|--------|--------|
| `whenGetMapData_withTightBBox_returnsFewerLocationsThanFullCorpus` | 3 | 1 |

## Verification Evidence

```bash
cd BackEnd && ./mvnw test -Dtest=VibeServiceTest,VibeControllerTest -q
# Tests run: 43, Failures: 0, Errors: 0
```

## Issues Encountered

None

## Next Phase Readiness

- Plan 10-03 can implement frontend `boundedCache.js` and wire MapView bbox params
- Backend map-data endpoint ready for viewport-scoped frontend requests

---
*Phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure*
*Completed: 2026-05-28*

## Self-Check: PASSED

- FOUND: BackEnd/src/main/java/com/manhattan/busyness_predictor/service/VibeService.java
- FOUND: BackEnd/src/main/resources/application.properties
- FOUND: .planning/phases/10-cache-ownership-map-scaling-and-docker-smoke-closure/10-02-SUMMARY.md
- FOUND: ddb25669
- FOUND: 76b046c6
- FOUND: 7b37f8b5
