import polyline from '@mapbox/polyline';

export const FALLBACK_POLYLINE_NOTICE =
  'Showing an approximate route because detailed route geometry is unavailable.';

export function parseGoogleDurationSeconds(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function formatDistanceMeters(meters) {
  if (meters == null || !Number.isFinite(meters) || meters < 0) {
    return null;
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  const formatted = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${formatted} km`;
}

function extractInstruction(step) {
  let instruction = 'Continue on route';

  if (step.navigationInstruction?.instructions) {
    instruction = step.navigationInstruction.instructions;
  } else if (step.instructions) {
    instruction = step.instructions;
  } else if (step.navigationInstruction?.primaryText?.text) {
    instruction = step.navigationInstruction.primaryText.text;
  } else if (
    step.navigationInstruction?.primaryText &&
    typeof step.navigationInstruction.primaryText === 'string'
  ) {
    instruction = step.navigationInstruction.primaryText;
  }

  if (
    typeof instruction === 'number' ||
    (typeof instruction === 'string' && instruction.match(/^\d+s?$/))
  ) {
    instruction = 'Continue on route';
  }

  if (step.transitDetails) {
    const line = step.transitDetails.line?.shortName || 'Transit';
    const headsign = step.transitDetails.headsign || 'destination';
    instruction = `Take ${line} toward ${headsign}`;
  } else if (instruction === 'Continue on route') {
    const seconds = parseGoogleDurationSeconds(step.staticDuration);
    if (seconds != null && seconds > 0) {
      const minutes = Math.round(seconds / 60);
      if (!Number.isNaN(minutes) && minutes > 0) {
        instruction = `Continue for ${minutes} minutes`;
      }
    }
  }

  return instruction;
}

function normalizeLocation(location) {
  if (!location) {
    return null;
  }
  if (location.latLng) {
    return {
      lat: location.latLng.latitude,
      lng: location.latLng.longitude,
      name: location.name ?? null,
    };
  }
  if (location.lat != null && location.lng != null) {
    return { lat: location.lat, lng: location.lng, name: location.name ?? null };
  }
  return null;
}

export function normalizeStep(step, { legIndex = 0, legStartLocation = null, legEndLocation = null } = {}) {
  const seconds = parseGoogleDurationSeconds(step.staticDuration);
  const instruction = extractInstruction(step);

  return {
    instructions: instruction,
    distance: formatDistanceMeters(step.distanceMeters),
    duration: formatDuration(seconds),
    summary: instruction,
    legIndex,
    legStartLocation,
    legEndLocation,
    ...(step.transitDetails ? { transitDetails: step.transitDetails } : {}),
  };
}

export function buildFallbackPolyline(start, end) {
  return [
    [start.lat, start.lng],
    [end.lat, end.lng],
  ];
}

export function fallbackPolylineFromEndpoints(start, end) {
  return buildFallbackPolyline(start, end);
}

export function decodeRoutePolyline(encodedPolyline) {
  if (!encodedPolyline) {
    return [];
  }
  try {
    return polyline.decode(encodedPolyline);
  } catch {
    return [];
  }
}

export function normalizeRoute(googleResponse) {
  const route = googleResponse?.routes?.[0];
  if (!route) {
    return {
      steps: [],
      encodedPolyline: null,
      polylineCoordinates: [],
      fallbackNotice: FALLBACK_POLYLINE_NOTICE,
    };
  }

  const encodedPolyline =
    route.polyline?.encodedPolyline ?? route.polyline?.polyline ?? null;
  const polylineCoordinates = decodeRoutePolyline(encodedPolyline);

  const steps = (route.legs ?? []).flatMap((leg, legIndex) => {
    const legStartLocation = normalizeLocation(leg.startLocation);
    const legEndLocation = normalizeLocation(leg.endLocation);

    return (leg.steps ?? []).map((step) =>
      normalizeStep(step, { legIndex, legStartLocation, legEndLocation })
    );
  });

  return {
    steps,
    encodedPolyline,
    polylineCoordinates,
    fallbackNotice:
      polylineCoordinates.length > 0 ? null : FALLBACK_POLYLINE_NOTICE,
  };
}
