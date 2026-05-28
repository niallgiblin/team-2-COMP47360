const COORD_DECIMALS = 4;

export const MAP_DATA_CACHE_TTL_MS = 600_000;
export const SEARCH_CACHE_TTL_MS = 300_000;
export const BUSYNESS_SESSION_TTL_MS = 1_800_000;
export const BUSYNESS_SESSION_MAX_BYTES = 4_000_000;

export const DEFAULT_MAP_BBOX = {
  minLat: 40.7,
  maxLat: 40.86,
  minLng: -74.05,
  maxLng: -73.92,
};

function normalizeCoord(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toFixed(COORD_DECIMALS);
}

function bboxCoords(minLat, maxLat, minLng, maxLng) {
  if (
    minLat != null &&
    typeof minLat === 'object' &&
    !Array.isArray(minLat)
  ) {
    const bbox = minLat;
    return {
      minLat: bbox.minLat,
      maxLat: bbox.maxLat,
      minLng: bbox.minLng,
      maxLng: bbox.maxLng,
    };
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function formatBBoxCacheKey(minLat, maxLat, minLng, maxLng) {
  const bbox = bboxCoords(minLat, maxLat, minLng, maxLng);
  return [
    normalizeCoord(bbox.minLat),
    normalizeCoord(bbox.maxLat),
    normalizeCoord(bbox.minLng),
    normalizeCoord(bbox.maxLng),
  ].join(',');
}

export function createBoundedCache({
  maxEntries = 128,
  ttlMs = MAP_DATA_CACHE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();
  const pending = new Map();

  const isExpired = (entry) => now() - entry.timestamp > ttlMs;

  const touchEntry = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const evictIfNeeded = () => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      entries.delete(oldestKey);
    }
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) {
        return undefined;
      }
      if (isExpired(entry)) {
        entries.delete(key);
        return undefined;
      }
      touchEntry(key, entry);
      return entry.value;
    },

    set(key, value) {
      entries.set(key, { value, timestamp: now() });
      evictIfNeeded();
    },

    getOrSet(key, factory) {
      const existing = this.get(key);
      if (existing !== undefined) {
        return existing;
      }

      if (pending.has(key)) {
        return pending.get(key);
      }

      const result = factory();
      if (result != null && typeof result.then === 'function') {
        const promise = result
          .then((value) => {
            this.set(key, value);
            pending.delete(key);
            return value;
          })
          .catch((error) => {
            pending.delete(key);
            throw error;
          });
        pending.set(key, promise);
        return promise;
      }

      this.set(key, result);
      return result;
    },

    clear() {
      entries.clear();
      pending.clear();
    },

    size() {
      return entries.size;
    },
  };
}
