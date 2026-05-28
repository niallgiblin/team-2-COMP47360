export const MAP_DATA_CACHE_TTL_MS = 10 * 60 * 1000;
export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
export const BUSYNESS_SESSION_TTL_MS = 30 * 60 * 1000;

export function formatBBoxCacheKey(minLat, maxLat, minLng, maxLng) {
  throw new Error('Not implemented — plan 10-03');
}

export function createBoundedCache() {
  throw new Error('Not implemented — plan 10-03');
}
