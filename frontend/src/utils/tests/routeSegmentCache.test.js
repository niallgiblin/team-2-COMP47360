import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { routeSegmentKey, createRouteSegmentCache } from '../routeSegmentCache';

const origin = { lat: 40.758896, lng: -73.985130 };
const destination = { lat: 40.761448, lng: -73.977776 };
const segmentPayload = { polyline: 'abc123', legs: [{ steps: [] }] };

describe('routeSegmentKey', () => {
  test('includes rounded origin lat/lng, destination lat/lng, and mode', () => {
    const walkKey = routeSegmentKey(origin, destination, 'WALK');
    const transitKey = routeSegmentKey(origin, destination, 'TRANSIT');

    expect(walkKey).toContain('40.7589');
    expect(walkKey).toContain('-73.9851');
    expect(walkKey).toContain('40.7614');
    expect(walkKey).toContain('-73.9778');
    expect(walkKey).toContain('WALK');
    expect(transitKey).toContain('TRANSIT');
    expect(walkKey).not.toBe(transitKey);
  });

  test('produces stable keys for coordinates that round to the same values', () => {
    const keyA = routeSegmentKey(
      { lat: 40.758896, lng: -73.985130 },
      { lat: 40.761448, lng: -73.977776 },
      'WALK'
    );
    const keyB = routeSegmentKey(
      { lat: 40.758899, lng: -73.985131 },
      { lat: 40.761441, lng: -73.977771 },
      'WALK'
    );

    expect(keyA).toBe(keyB);
  });
});

describe('createRouteSegmentCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns cached segment for repeated same origin/destination/mode lookups', () => {
    const cache = createRouteSegmentCache({ maxEntries: 10, ttlMs: 60_000 });

    cache.set(origin, destination, 'WALK', segmentPayload);
    const hit = cache.get(origin, destination, 'WALK');
    const miss = cache.get(origin, destination, 'TRANSIT');

    expect(hit).toEqual(segmentPayload);
    expect(miss).toBeUndefined();
  });

  test('evicts oldest entry when max entries exceeded', () => {
    const cache = createRouteSegmentCache({ maxEntries: 2, ttlMs: 60_000 });
    const otherOrigin = { lat: 40.7500, lng: -73.9900 };
    const otherDest = { lat: 40.7550, lng: -73.9800 };
    const thirdDest = { lat: 40.7600, lng: -73.9700 };

    cache.set(origin, destination, 'WALK', { id: 'first' });
    cache.set(otherOrigin, otherDest, 'WALK', { id: 'second' });
    cache.set(origin, thirdDest, 'WALK', { id: 'third' });

    expect(cache.get(origin, destination, 'WALK')).toBeUndefined();
    expect(cache.get(otherOrigin, otherDest, 'WALK')).toEqual({ id: 'second' });
    expect(cache.get(origin, thirdDest, 'WALK')).toEqual({ id: 'third' });
  });

  test('expires entries after ttlMs without wall-clock sleep', () => {
    const cache = createRouteSegmentCache({ maxEntries: 10, ttlMs: 5_000 });

    cache.set(origin, destination, 'WALK', segmentPayload);
    expect(cache.get(origin, destination, 'WALK')).toEqual(segmentPayload);

    vi.advanceTimersByTime(5_001);

    expect(cache.get(origin, destination, 'WALK')).toBeUndefined();
  });
});
