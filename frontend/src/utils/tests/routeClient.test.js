import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  computeRoutes,
  computeMultiStopRoute,
  ROUTE_SERVICE_UNAVAILABLE,
  ROUTE_NOT_CONFIGURED,
} from '../routeClient';

const API_KEY = 'test-google-key';

const walkingRouteResponse = {
  routes: [
    {
      legs: [
        {
          steps: [
            {
              distanceMeters: 250,
              staticDuration: '180s',
              navigationInstruction: { instructions: 'Walk north on Broadway' },
            },
          ],
        },
        {
          steps: [
            {
              distanceMeters: 400,
              staticDuration: '300s',
              navigationInstruction: { instructions: 'Turn left on 42nd St' },
            },
          ],
        },
      ],
      polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
    },
  ],
};

describe('computeRoutes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('POSTs to Google computeRoutes with explicit field mask fields', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => walkingRouteResponse,
    });

    await computeRoutes(
      {
        origin: { lat: 40.7589, lng: -73.9851 },
        destination: { lat: 40.7614, lng: -73.9778 },
        travelMode: 'WALK',
        apiKey: API_KEY,
      }
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
        }),
      })
    );

    const callHeaders = fetch.mock.calls[0][1].headers;
    const fieldMask = callHeaders['X-Goog-FieldMask'];

    expect(fieldMask).toContain('routes.legs.steps.distanceMeters');
    expect(fieldMask).toContain('routes.legs.steps.staticDuration');
    expect(fieldMask).toContain('routes.polyline.encodedPolyline');
    expect(fieldMask).not.toContain('*');
  });

  test('returns route data on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => walkingRouteResponse,
    });

    const result = await computeRoutes({
      origin: { lat: 40.7589, lng: -73.9851 },
      destination: { lat: 40.7614, lng: -73.9778 },
      travelMode: 'WALK',
      apiKey: API_KEY,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].legs).toHaveLength(2);
  });

  test('returns service unavailable message when Google route fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    const result = await computeRoutes({
      origin: { lat: 40.7589, lng: -73.9851 },
      destination: { lat: 40.7614, lng: -73.9778 },
      travelMode: 'WALK',
      apiKey: API_KEY,
    });

    expect(result.error).toBe(ROUTE_SERVICE_UNAVAILABLE);
    expect(result.error).toBe(
      'Route service is unavailable right now. Try again in a moment.'
    );
  });

  test('returns configuration message when api key is missing', async () => {
    const result = await computeRoutes({
      origin: { lat: 40.7589, lng: -73.9851 },
      destination: { lat: 40.7614, lng: -73.9778 },
      travelMode: 'WALK',
      apiKey: '',
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.error).toBe(ROUTE_NOT_CONFIGURED);
    expect(result.error).toBe('Route service is not configured for this environment.');
  });
});

describe('computeMultiStopRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('uses one computeRoutes response with legs for walking multi-stop route', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => walkingRouteResponse,
    });

    const result = await computeMultiStopRoute({
      origin: { lat: 40.7589, lng: -73.9851 },
      intermediates: [{ lat: 40.7600, lng: -73.9800 }],
      destination: { lat: 40.7614, lng: -73.9778 },
      travelMode: 'WALK',
      apiKey: API_KEY,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.routes[0].legs).toHaveLength(2);
    expect(result.sourceCalls).toBe(1);
  });
});
