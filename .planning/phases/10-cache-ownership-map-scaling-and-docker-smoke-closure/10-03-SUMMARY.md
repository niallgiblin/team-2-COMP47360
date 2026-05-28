---
phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
plan: 03
subsystem: ui
tags: [bounded-cache, bbox, mapview, findmyvibe, vitest, perf-05, maint-05]

requires:
  - phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
    provides: Backend bbox map-data and Caffeine caches from plan 10-02

provides:
  - createBoundedCache factory with LRU, TTL, async getOrSet deduplication
  - vibeAPI.mapDataUrl(bbox) query string builder
  - MapView DEFAULT_MAP_BBOX map-data fetch and bounded module cache
  - FindMyVibe bounded search cache with clearSearchCache export

affects:
  - 10-04-PLAN.md
  - invalidateClientCaches wiring

tech-stack:
  added: []
  patterns:
    - "Module-level createBoundedCache singletons with exported clear() helpers"
    - "formatBBoxCacheKey four-decimal normalization aligned with routeSegmentCache"

key-files:
  created: []
  modified:
    - frontend/src/utils/boundedCache.js
    - frontend/src/utils/tests/boundedCache.test.js
    - frontend/services/apiService.js
    - frontend/services/tests/apiService.test.js
    - frontend/src/pages/MapView.jsx
    - frontend/src/pages/FindMyVibe.jsx

key-decisions:
  - "MapView uses static DEFAULT_MAP_BBOX for first fetch; no moveend refetch in this plan"
  - "Async getOrSet with in-flight promise deduplication for concurrent map-data loads"
  - "clearMapDataCache and clearSearchCache exported for plan 10-04 invalidation"

patterns-established:
  - "Separate cache keys: zones:geojson vs venues:{bboxKey} under shared mapDataCache instance"

requirements-completed: [PERF-05, MAINT-05]

duration: 12min
completed: 2026-05-28
---

# Phase 10 Plan 03: Frontend Bounded Caches and MapView Bbox Fetch Summary

**Shared createBoundedCache factory greens Wave 0 tests; MapView and FindMyVibe use bounded TTL caches; map-data fetches always include Manhattan DEFAULT_MAP_BBOX query params**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-28T14:50:00Z
- **Completed:** 2026-05-28T14:52:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Implemented `createBoundedCache`, `formatBBoxCacheKey`, and TTL/size constants (D-06)
- Extended `vibeAPI.mapDataUrl(bbox)` with backward-compatible no-arg base path (D-01 client)
- Migrated MapView to `authFetch(vibeAPI.mapDataUrl(DEFAULT_MAP_BBOX))` with bounded cache (D-02)
- Replaced FindMyVibe unbounded `Map` search cache with `createBoundedCache` (D-06)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement createBoundedCache and green Vitest** - `6e108463` (feat)
2. **Task 2: Extend vibeAPI.mapDataUrl(bbox) and tests** - `d06b3e40` (feat)
3. **Task 3: Migrate MapView and FindMyVibe to bounded caches** - `1d9afc7a` (feat)

## Files Created/Modified

- `frontend/src/utils/boundedCache.js` - LRU+TTL cache factory, bbox key helper, DEFAULT_MAP_BBOX
- `frontend/services/apiService.js` - `mapDataUrl(bbox)` URLSearchParams builder
- `frontend/services/tests/apiService.test.js` - bbox query string Vitest
- `frontend/src/pages/MapView.jsx` - bounded map cache, bbox map-data fetch, `clearMapDataCache`
- `frontend/src/pages/FindMyVibe.jsx` - bounded search cache, `clearSearchCache`

## Decisions Made

- Async `getOrSet` deduplicates concurrent fetches via pending promise map while keeping sync path for tests
- Zone GeoJSON and venues cached under separate keys in one `mapDataCache` instance (max 32 entries)
- `BusynessContext` still uses bare `mapDataUrl()` — out of scope; MapView production path uses bbox per D-02

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `clearMapDataCache` and `clearSearchCache` ready for plan 10-04 `invalidateClientCaches` wiring
- BusynessContext sessionStorage byte guard can use `BUSYNESS_SESSION_MAX_BYTES` from boundedCache exports

## Self-Check: PASSED

- FOUND: frontend/src/utils/boundedCache.js
- FOUND: frontend/src/pages/MapView.jsx
- FOUND: frontend/src/pages/FindMyVibe.jsx
- FOUND: commit 6e108463
- FOUND: commit d06b3e40
- FOUND: commit 1d9afc7a

---
*Phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure*
*Completed: 2026-05-28*
