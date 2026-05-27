export const GOOGLE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

export const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.legs.distanceMeters',
  'routes.legs.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.transitDetails',
  'routes.polyline.encodedPolyline',
].join(',');

export const ROUTE_NOT_CONFIGURED =
  'Route service is not configured for this environment.';

export const ROUTE_SERVICE_UNAVAILABLE =
  'Route service is unavailable right now. Try again in a moment.';

function toGoogleLatLng(point) {
  return {
    location: {
      latLng: {
        latitude: point.lat,
        longitude: point.lng,
      },
    },
  };
}

export function buildRouteRequest({
  origin,
  destination,
  intermediates = [],
  mode = 'WALK',
  travelMode,
} = {}) {
  const requestBody = {
    origin: toGoogleLatLng(origin),
    destination: toGoogleLatLng(destination),
    travelMode: travelMode ?? mode,
  };

  if (intermediates.length > 0) {
    requestBody.intermediates = intermediates.map(toGoogleLatLng);
  }

  return requestBody;
}

async function postComputeRoutes({ requestBody, apiKey, fetchImpl = fetch }) {
  if (!apiKey) {
    return { error: ROUTE_NOT_CONFIGURED };
  }

  try {
    const response = await fetchImpl(GOOGLE_ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return { error: ROUTE_SERVICE_UNAVAILABLE };
    }

    return await response.json();
  } catch {
    return { error: ROUTE_SERVICE_UNAVAILABLE };
  }
}

export async function computeRoutes({
  origin,
  destination,
  travelMode = 'WALK',
  mode,
  apiKey,
  fetchImpl = fetch,
}) {
  const requestBody = buildRouteRequest({
    origin,
    destination,
    mode: mode ?? travelMode,
    travelMode: travelMode ?? mode,
  });

  return postComputeRoutes({ requestBody, apiKey, fetchImpl });
}

export async function computeMultiStopRoute({
  origin,
  destination,
  intermediates = [],
  travelMode = 'WALK',
  mode,
  apiKey,
  fetchImpl = fetch,
}) {
  const requestBody = buildRouteRequest({
    origin,
    destination,
    intermediates,
    mode: mode ?? travelMode,
    travelMode: travelMode ?? mode,
  });

  const result = await postComputeRoutes({ requestBody, apiKey, fetchImpl });
  if (result.error) {
    return result;
  }

  return {
    ...result,
    sourceCalls: 1,
  };
}

export const computeRoute = computeRoutes;
