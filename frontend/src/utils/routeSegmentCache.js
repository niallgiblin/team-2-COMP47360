const COORD_DECIMALS = 4;

function normalizeCoord(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toFixed(COORD_DECIMALS);
}

function normalizePoint(point) {
  const lat = point?.lat ?? point?.latitude;
  const lng = point?.lng ?? point?.longitude;
  return `${normalizeCoord(lat)},${normalizeCoord(lng)}`;
}

export function routeSegmentKey(origin, destination, mode) {
  return `${mode}|${normalizePoint(origin)}|${normalizePoint(destination)}`;
}

export function createRouteSegmentCache({
  maxEntries = 128,
  ttlMs = 10 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();

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
    get(origin, destination, mode) {
      const key = routeSegmentKey(origin, destination, mode);
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

    set(origin, destination, mode, value) {
      const key = routeSegmentKey(origin, destination, mode);
      entries.set(key, { value, timestamp: now() });
      evictIfNeeded();
    },

    getOrSet(origin, destination, mode, factory) {
      const existing = this.get(origin, destination, mode);
      if (existing !== undefined) {
        return existing;
      }
      const value = factory();
      this.set(origin, destination, mode, value);
      return value;
    },

    clear() {
      entries.clear();
    },

    size() {
      return entries.size;
    },
  };
}
