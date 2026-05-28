import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createBoundedCache,
  formatBBoxCacheKey,
  MAP_DATA_CACHE_TTL_MS,
  SEARCH_CACHE_TTL_MS,
  BUSYNESS_SESSION_TTL_MS,
} from '../boundedCache';

describe('bounded cache TTL constants', () => {
  test('exports TTL values aligned with MapView, FindMyVibe, and BusynessContext', () => {
    expect(MAP_DATA_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    expect(SEARCH_CACHE_TTL_MS).toBe(5 * 60 * 1000);
    expect(BUSYNESS_SESSION_TTL_MS).toBe(30 * 60 * 1000);
  });
});

describe('formatBBoxCacheKey', () => {
  test('normalizes coordinates to four decimal places for stable keys', () => {
    const keyA = formatBBoxCacheKey(40.758896, 40.761448, -73.98513, -73.977776);
    const keyB = formatBBoxCacheKey(40.758899, 40.761441, -73.985131, -73.977771);

    expect(keyA).toBe('40.7589,40.7614,-73.9851,-73.9778');
    expect(keyA).toBe(keyB);
  });
});

describe('createBoundedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('evicts oldest entry when max entries exceeded', () => {
    const cache = createBoundedCache({ maxEntries: 2, ttlMs: 60_000 });

    cache.set('first', { id: 1 });
    cache.set('second', { id: 2 });
    cache.set('third', { id: 3 });

    expect(cache.get('first')).toBeUndefined();
    expect(cache.get('second')).toEqual({ id: 2 });
    expect(cache.get('third')).toEqual({ id: 3 });
    expect(cache.size()).toBe(2);
  });

  test('expires entries after ttlMs without wall-clock sleep', () => {
    const cache = createBoundedCache({ maxEntries: 10, ttlMs: 5_000 });

    cache.set('segment', { polyline: 'abc' });
    expect(cache.get('segment')).toEqual({ polyline: 'abc' });

    vi.advanceTimersByTime(5_001);

    expect(cache.get('segment')).toBeUndefined();
  });

  test('clear resets size to zero', () => {
    const cache = createBoundedCache({ maxEntries: 10, ttlMs: 60_000 });

    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  test('getOrSet computes value once per key', () => {
    const cache = createBoundedCache({ maxEntries: 10, ttlMs: 60_000 });
    const factory = vi.fn(() => ({ value: 42 }));

    const first = cache.getOrSet('key', factory);
    const second = cache.getOrSet('key', factory);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
