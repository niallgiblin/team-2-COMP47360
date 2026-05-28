---
phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
plan: 04
subsystem: auth
tags: [cache-invalidation, auth-context, busyness-context, sessionStorage, vitest, maint-05]

requires:
  - phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure
    provides: clearMapDataCache, clearSearchCache, boundedCache TTL constants from plan 10-03

provides:
  - invalidateClientCaches central auth lifecycle cache clear
  - registerBusynessClear and registerModuleCacheClear hooks
  - BusynessContext payload size guard and shared TTL constants
  - invalidateBusynessSnapshot export for plan 10-05 inventory
  - AuthContext tests for logout/401 invalidation

affects:
  - 10-05-PLAN.md
  - cache inventory documentation

tech-stack:
  added: []
  patterns:
    - "Module-level cache clear registry avoids page import cycles"
    - "Auth logout and 401 share invalidateClientCaches via logout()"
    - "BusynessProvider registers clearCache on mount for auth invalidation"

key-files:
  created:
    - frontend/src/cache/invalidateClientCaches.js
  modified:
    - frontend/src/context/BusynessContext.jsx
    - frontend/src/context/AuthContext.jsx
    - frontend/src/pages/MapView.jsx
    - frontend/src/pages/FindMyVibe.jsx
    - frontend/src/utils/routeSegmentCache.js
    - frontend/src/context/tests/AuthContext.test.jsx

key-decisions:
  - "Module cache registry used instead of direct MapView/FindMyVibe imports to break AuthContext circular dependency"
  - "routeSegmentCache exported as singleton from routeSegmentCache.js for shared invalidation"
  - "401 path clears caches via logout() calling invalidateClientCaches once"

patterns-established:
  - "registerModuleCacheClear(fn) for page-level bounded caches"
  - "registerBusynessClear(fn) wired by BusynessProvider useEffect"

requirements-completed: [MAINT-05]

duration: 6min
completed: 2026-05-28
---

# Phase 10 Plan 04: Auth Cache Invalidation and Busyness Session Guard Summary

**Auth logout and 401 invoke invalidateClientCaches; BusynessContext uses shared TTL constants with sessionStorage payload guard; no refresh UI added**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-28T14:52:37Z
- **Completed:** 2026-05-28T14:53:35Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- BusynessContext imports `BUSYNESS_SESSION_TTL_MS` / `BUSYNESS_SESSION_MAX_BYTES` and skips oversized sessionStorage persist (D-07)
- `invalidateClientCaches` clears busyness snapshot, map-data cache, search cache, route segments, and global fetch dedup (D-10)
- AuthContext calls invalidation at start of `logout()`; 401 path inherits via existing `logout()` call
- Extended AuthContext Vitest coverage for logout, 401, and sessionStorage key removal with BusynessProvider

## Task Commits

Each task was committed atomically:

1. **Task 1: BusynessContext TTL constants and payload size guard (D-07)** - `57826d81` (feat)
2. **Task 2: Implement invalidateClientCaches and AuthContext wiring (D-10)** - `98dc8f49` (test), `9b1a7472` (feat)
3. **Task 3: Export BusynessContext invalidate hook for inventory cross-ref** - `8c1e072b` (feat)

## Files Created/Modified

- `frontend/src/cache/invalidateClientCaches.js` - Central invalidation with busyness and module cache registries
- `frontend/src/context/AuthContext.jsx` - Calls `invalidateClientCaches()` at logout start
- `frontend/src/context/BusynessContext.jsx` - TTL constants, payload guard, registry, `invalidateBusynessSnapshot`
- `frontend/src/pages/MapView.jsx` - Registers `clearMapDataCache`; uses shared `routeSegmentCache`
- `frontend/src/pages/FindMyVibe.jsx` - Registers `clearSearchCache`
- `frontend/src/utils/routeSegmentCache.js` - Exported singleton `routeSegmentCache`
- `frontend/src/context/tests/AuthContext.test.jsx` - Logout/401 invalidation and sessionStorage assertions

## Decisions Made

- Module-level `registerModuleCacheClear` avoids importing MapView/FindMyVibe from `invalidateClientCaches` (circular dependency with AuthContext)
- `routeSegmentCache` singleton moved to utility module for shared clear access
- TDD RED commit precedes GREEN implementation for auth invalidation tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Module cache registry instead of direct page imports**
- **Found during:** Task 2 (invalidateClientCaches implementation)
- **Issue:** Direct imports of MapView/FindMyVibe from invalidateClientCaches created circular dependency through BusynessContext → useAuth → AuthContext
- **Fix:** Added `registerModuleCacheClear`; MapView and FindMyVibe register clears on module load
- **Files modified:** invalidateClientCaches.js, MapView.jsx, FindMyVibe.jsx
- **Verification:** AuthContext tests pass; build succeeds
- **Committed in:** `9b1a7472`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Registry preserves plan intent (same caches cleared) without import cycles.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `invalidateBusynessSnapshot`, `clearMapDataCache`, `clearSearchCache`, and `routeSegmentCache.clear()` ready for plan 10-05 cache inventory table
- No refresh UI control added per D-10

## Self-Check: PASSED

- FOUND: frontend/src/cache/invalidateClientCaches.js
- FOUND: frontend/src/context/BusynessContext.jsx
- FOUND: frontend/src/context/AuthContext.jsx
- FOUND: commit 57826d81
- FOUND: commit 98dc8f49
- FOUND: commit 9b1a7472
- FOUND: commit 8c1e072b

---
*Phase: 10-cache-ownership-map-scaling-and-docker-smoke-closure*
*Completed: 2026-05-28*
