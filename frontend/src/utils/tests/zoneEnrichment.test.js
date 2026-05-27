import { describe, test, expect, vi } from 'vitest';
import { enrichVenueZone } from '../zoneEnrichment';

const tinyZoneGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { LocationID: 42, name: 'Midtown' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-74.0, 40.75],
            [-73.98, 40.75],
            [-73.98, 40.77],
            [-74.0, 40.77],
            [-74.0, 40.75],
          ],
        ],
      },
    },
  ],
};

describe('enrichVenueZone', () => {
  test('returns existing backend zoneId unchanged and skips polygon lookup', () => {
    const lookup = vi.fn(() => 'should-not-run');
    const venue = {
      id: 1,
      name: 'Test Venue',
      lat: 40.76,
      lng: -73.99,
      zoneId: '99',
    };

    const result = enrichVenueZone(venue, tinyZoneGeoJson, { lookupPointInPolygon: lookup });

    expect(result.zoneId).toBe('99');
    expect(lookup).not.toHaveBeenCalled();
  });

  test('assigns zoneId from polygon LocationID when backend zoneId is missing', () => {
    const venue = {
      id: 2,
      name: 'Inside Zone',
      lat: 40.76,
      lng: -73.99,
    };

    const result = enrichVenueZone(venue, tinyZoneGeoJson);

    expect(result.zoneId).toBe('42');
    expect(result.name).toBe('Inside Zone');
  });

  test('handles boundary coordinates without throwing and leaves venue usable', () => {
    const venue = {
      id: 3,
      name: 'Edge Venue',
      lat: 40.75,
      lng: -74.0,
    };

    expect(() => enrichVenueZone(venue, tinyZoneGeoJson)).not.toThrow();
    const result = enrichVenueZone(venue, tinyZoneGeoJson);
    expect(result.name).toBe('Edge Venue');
  });

  test('handles no polygon match without throwing', () => {
    const venue = {
      id: 4,
      name: 'Outside NYC',
      lat: 40.0,
      lng: -75.0,
    };

    expect(() => enrichVenueZone(venue, tinyZoneGeoJson)).not.toThrow();
    const result = enrichVenueZone(venue, tinyZoneGeoJson);
    expect(result.zoneId).toBeUndefined();
    expect(result.name).toBe('Outside NYC');
  });

  test('uses injected lookup wrapper when provided for fallback path', () => {
    const lookup = vi.fn(() => true);
    const venue = { id: 5, name: 'Spy Venue', lat: 40.76, lng: -73.99 };

    enrichVenueZone(venue, tinyZoneGeoJson, { lookupPointInPolygon: lookup });

    expect(lookup).toHaveBeenCalled();
  });

  test('preserves backend zoneId for vibe-shaped venue objects without polygon lookup', () => {
    const lookup = vi.fn(() => true);
    const vibeVenue = {
      id: 'place-123',
      placeId: 'place-123',
      name: 'Vibe Bar',
      latitude: 40.76,
      longitude: -73.99,
      zone: 'Midtown',
      zoneId: '55',
      tags: ['cozy', 'jazz'],
    };

    const result = enrichVenueZone(vibeVenue, tinyZoneGeoJson, {
      lookupPointInPolygon: lookup,
    });

    expect(result.zoneId).toBe('55');
    expect(result.tags).toEqual(['cozy', 'jazz']);
    expect(lookup).not.toHaveBeenCalled();
  });
});
