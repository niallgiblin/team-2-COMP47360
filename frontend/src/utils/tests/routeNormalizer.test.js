import { describe, test, expect } from 'vitest';
import {
  normalizeStep,
  normalizeRoute,
  parseGoogleDurationSeconds,
  formatDistanceMeters,
  buildFallbackPolyline,
} from '../routeNormalizer';

const transitStep = {
  distanceMeters: 1200,
  staticDuration: '600s',
  navigationInstruction: { instructions: 'Take the subway' },
  transitDetails: {
    line: { shortName: 'N', vehicle: { type: 'SUBWAY' } },
    headsign: 'Astoria',
    departureStop: { name: 'Times Sq' },
    arrivalStop: { name: '42 St' },
  },
};

describe('parseGoogleDurationSeconds', () => {
  test('parses integer protobuf duration strings', () => {
    expect(parseGoogleDurationSeconds('180s')).toBe(180);
  });

  test('parses decimal protobuf duration strings', () => {
    expect(parseGoogleDurationSeconds('3.5s')).toBe(3.5);
  });

  test('returns null for missing or invalid values', () => {
    expect(parseGoogleDurationSeconds(null)).toBeNull();
    expect(parseGoogleDurationSeconds('')).toBeNull();
    expect(parseGoogleDurationSeconds('invalid')).toBeNull();
  });
});

describe('formatDistanceMeters', () => {
  test('formats meters for short distances', () => {
    expect(formatDistanceMeters(250)).toContain('250 m');
  });
});

describe('normalizeStep', () => {
  test('maps distanceMeters and staticDuration to separate distance and duration text', () => {
    const step = normalizeStep(
      {
        distanceMeters: 250,
        staticDuration: '180s',
        navigationInstruction: { instructions: 'Walk north' },
      },
      { legIndex: 0 }
    );

    expect(step.instructions).toBe('Walk north');
    expect(step.distance).toContain('250 m');
    expect(step.duration).toBe('3 min');
    expect(step.legIndex).toBe(0);
  });

  test('preserves transitDetails when present', () => {
    const step = normalizeStep(transitStep, { legIndex: 1 });

    expect(step.transitDetails).toEqual(transitStep.transitDetails);
    expect(step.instructions).toContain('N');
    expect(step.legIndex).toBe(1);
  });

  test('tolerates missing distance or duration fields', () => {
    const step = normalizeStep(
      { navigationInstruction: { instructions: 'Continue' } },
      { legIndex: 0 }
    );

    expect(step.instructions).toBe('Continue');
    expect(step.distance).toBeNull();
    expect(step.duration).toBeNull();
  });
});

describe('normalizeRoute', () => {
  test('normalizes two route legs from one Google response', () => {
    const googleResponse = {
      routes: [
        {
          legs: [
            {
              startLocation: { latLng: { latitude: 40.7589, longitude: -73.9851 } },
              endLocation: { latLng: { latitude: 40.7600, longitude: -73.9800 } },
              steps: [
                {
                  distanceMeters: 250,
                  staticDuration: '180s',
                  navigationInstruction: { instructions: 'Walk north' },
                },
              ],
            },
            {
              startLocation: { latLng: { latitude: 40.7600, longitude: -73.9800 } },
              endLocation: { latLng: { latitude: 40.7614, longitude: -73.9778 } },
              steps: [
                {
                  distanceMeters: 400,
                  staticDuration: '300s',
                  navigationInstruction: { instructions: 'Turn left' },
                },
              ],
            },
          ],
          polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
        },
      ],
    };

    const result = normalizeRoute(googleResponse);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].legIndex).toBe(0);
    expect(result.steps[1].legIndex).toBe(1);
    expect(result.steps[0].distance).toContain('250 m');
    expect(result.steps[0].duration).toBe('3 min');
    expect(result.steps[1].distance).toContain('400 m');
    expect(result.steps[1].duration).toBe('5 min');
    expect(result.encodedPolyline).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
});

describe('buildFallbackPolyline', () => {
  test('returns start/end coordinate pair when detailed geometry is unavailable', () => {
    const start = { lat: 40.7589, lng: -73.9851 };
    const end = { lat: 40.7614, lng: -73.9778 };

    const polyline = buildFallbackPolyline(start, end);

    expect(polyline).toEqual([
      [40.7589, -73.9851],
      [40.7614, -73.9778],
    ]);
  });
});
