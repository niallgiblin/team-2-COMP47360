---
phase: 06-busyness-service-reliability-and-model-safety
plan: 03
subsystem: api-performance
tags: [flask, cache, ttl, forecast]
requires:
  - phase: 06-busyness-service-reliability-and-model-safety
    provides: Plan 01 cache and route tests
provides:
  - Separate bounded live and forecast caches
  - Stable /busyness response shape
affects: [busyness-service, performance]
tech-stack:
  added: []
  patterns: [BoundedTTLCache, deterministic coordinate/time cache keys]
key-files:
  created: []
  modified: [BackEnd/busyness-service/app.py, BackEnd/busyness-service/tests/test_routes.py, BackEnd/busyness-service/tests/test_predictor.py]
key-decisions:
  - "`cached` is true only when both live and forecast values came from cache."
  - "Cache behavior remains process-local and request-triggered."
patterns-established:
  - "Live and forecast computation are split behind helper functions while `/busyness` keeps the public contract."
requirements-completed: [ML-02, ML-03, PERF-01, PERF-02]
duration: 12 min
completed: 2026-05-26
---

# Phase 06 Plan 03: Busyness Cache Summary

**Process-local bounded TTL caches now split live and forecast work behind the existing `/busyness` endpoint**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-26T20:59:33Z
- **Completed:** 2026-05-26T21:11:46Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added explicit `normalize_predictions()` behavior for empty, equal, and `None` prediction scores.
- Replaced the single global cache with `live_cache` and `forecast_cache` owners.
- Added deterministic rounded coordinate and hour-bucket cache keys.
- Preserved `/busyness` response keys: `success`, `predictions`, `forecast`, and `cached`.

## Task Commits

Inline execution was committed as one implementation commit:

1. **Task 1-3: Cache helpers, split computation, weather/forecast coverage** - `b95894e0` (`feat(06): harden busyness service reliability`)

## Files Created/Modified

- `BackEnd/busyness-service/app.py` - Bounded cache class, key builders, response builder, route orchestration.
- `BackEnd/busyness-service/tests/test_routes.py` - Live/forecast cache-hit and response-shape tests.
- `BackEnd/busyness-service/tests/test_predictor.py` - Cache key, TTL, normalization, weather, and forecast tests.

## Decisions Made

No Redis, Memcached, scheduler, new route, or distributed cache was added. Forecast optimization is request-triggered caching only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for final docs/config alignment and full validation.

---
*Phase: 06-busyness-service-reliability-and-model-safety*
*Completed: 2026-05-26*
