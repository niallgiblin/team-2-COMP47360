# Cache Inventory

Maintainer audit trail for Phase 10 cache ownership (MAINT-05, D-09). Busyness API maps use **zone names** as keys (e.g. `"100 NET"`), not numeric location IDs.

Related: [baseline-verification.md](baseline-verification.md) Phase 10 gates · deferred scaling in [.planning/codebase/CONCERNS.md](../.planning/codebase/CONCERNS.md) ("Public map data returns all locations").

| Owner | Storage | TTL | Max entries | Invalidation path | Requirement |
|-------|---------|-----|-------------|-------------------|-------------|
| **VibeService** `searchCache` | JVM Caffeine (`BackEnd/.../VibeService.java`) | `APP_VIBE_SEARCH_CACHE_TTL_SECONDS` (default 300s) | `APP_VIBE_SEARCH_CACHE_MAX_SIZE` (default 512) | JVM restart; entry expiry; no explicit client hook | MAINT-05 |
| **VibeService** `busynessCache` | JVM Caffeine, single key `"report"` | `APP_VIBE_BUSYNESS_CACHE_TTL_SECONDS` (default 600s) | 2 (hard-coded max for single report + headroom) | JVM restart; entry expiry | MAINT-05 |
| **VibeService** `mapDataCache` | JVM Caffeine, keys `"full"` or `bbox:{4-decimal coords}` | `APP_VIBE_MAP_DATA_CACHE_TTL_SECONDS` (default 300s) | `APP_VIBE_MAP_DATA_CACHE_MAX_SIZE` (default 64) | JVM restart; entry expiry | MAINT-05, PERF-05 |
| **LLM service** `search_cache` | Python `BoundedTTLCache` in-process (`BackEnd/llm-service/app.py`, `cache_policy.py`) | `SEARCH_CACHE_TTL_SECONDS` (default 300s) | `SEARCH_CACHE_MAX_ENTRIES` (default 512) | Process restart; TTL eviction; **inventory only — unchanged in Phase 10** | MAINT-05 |
| **Busyness service** `live_cache` / `forecast_cache` | Python `BoundedTTLCache` in-process (`BackEnd/busyness-service/app.py`) | `BUSYNESS_LIVE_CACHE_TTL_SECONDS` / `BUSYNESS_FORECAST_CACHE_TTL_SECONDS` (default 1800s each) | `BUSYNESS_CACHE_MAX_ENTRIES` (default 512 each) | Process restart; TTL eviction; **inventory only — unchanged in Phase 10** | MAINT-05 |
| **MapView** `mapDataCache` | Browser module `createBoundedCache` (`frontend/src/pages/MapView.jsx`) | `MAP_DATA_CACHE_TTL_MS` (10m, `boundedCache.js`) | 32 | `clearMapDataCache()` → `invalidateClientCaches()` on logout / 401 | MAINT-05 |
| **FindMyVibe** `searchCache` | Browser module `createBoundedCache` (`frontend/src/pages/FindMyVibe.jsx`) | `SEARCH_CACHE_TTL_MS` (5m) | 64 | `clearSearchCache()` → `invalidateClientCaches()` on logout / 401 | MAINT-05 |
| **BusynessContext** `venueBusynessCache_v3` | Browser `sessionStorage` + in-memory React state | `BUSYNESS_SESSION_TTL_MS` (30m) | Payload guard `BUSYNESS_SESSION_MAX_BYTES` (4MB); keys are zone names in stored maps | `invalidateBusynessSnapshot()` / provider `clearCache` → `invalidateClientCaches()` on logout / 401 | MAINT-05 |
| **MapView** `routeSegmentCache` | Browser `createRouteSegmentCache` singleton (`frontend/src/utils/routeSegmentCache.js`) | 10m (default factory TTL) | 128 | `routeSegmentCache.clear()` → `invalidateClientCaches()` on logout / 401 | MAINT-05 |
| **AuthContext** lifecycle | Orchestrator only (`frontend/src/cache/invalidateClientCaches.js`) | — | — | `logout()` and 401 path call `invalidateClientCaches()` (busyness sessionStorage, map-data, search, route segments, global fetch dedup) | MAINT-05, D-10 |

## Notes

- **No distributed cache** (Redis/Memcached) in v0.1; all caches are process-local or browser-local.
- **Python ML caches** are documented for audit completeness; Phase 10 did not refactor Flask cache modules.
- **Viewport bbox** reduces map-data payload size for the current ~2262-location corpus; vector tiling at **10k+ locations** remains deferred — see CONCERNS.md scaling path and [baseline-verification.md](baseline-verification.md) Phase 10 deferral notes.
