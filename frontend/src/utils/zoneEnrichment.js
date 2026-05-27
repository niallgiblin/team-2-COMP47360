import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

function normalizeVenue(venue) {
  const latitude = venue.latitude ?? venue.lat;
  const longitude = venue.longitude ?? venue.lng;

  return {
    ...venue,
    id: venue.id || venue.placeId,
    latitude,
    longitude,
    lat: venue.lat ?? latitude,
    lng: venue.lng ?? longitude,
    address: venue.address || 'No address provided',
    zone: venue.zone || venue.Zone || 'Unknown',
    ...(venue.zoneId != null && venue.zoneId !== ''
      ? { zoneId: String(venue.zoneId) }
      : {}),
  };
}

function findZoneIdFromPolygon(processed, zoneData, lookupPointInPolygon) {
  if (!zoneData?.features?.length) {
    return null;
  }

  const lat = processed.latitude;
  const lng = processed.longitude;
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return null;
  }

  try {
    const venuePoint = turfPoint([Number(lng), Number(lat)]);
    const matchingZone = zoneData.features.find((feature) =>
      lookupPointInPolygon(venuePoint, feature.geometry),
    );

    if (matchingZone?.properties?.LocationID != null) {
      return String(matchingZone.properties.LocationID);
    }
  } catch {
    // Invalid geometry or coordinates — leave zoneId unset.
  }

  return null;
}

/**
 * Enrich a single venue with zoneId, preserving backend zoneId when present.
 */
export function enrichVenueZone(venue, zoneData, options = {}) {
  const lookupPointInPolygon =
    options.lookupPointInPolygon ?? booleanPointInPolygon;

  const processed = normalizeVenue(venue);

  if (processed.zoneId) {
    return processed;
  }

  const zoneIdFromPolygon = findZoneIdFromPolygon(
    processed,
    zoneData,
    lookupPointInPolygon,
  );

  if (zoneIdFromPolygon) {
    return { ...processed, zoneId: zoneIdFromPolygon };
  }

  return processed;
}

/**
 * Enrich an array of venues with zoneId assignments.
 */
export function enrichVenuesWithZones(venues, zoneData, options = {}) {
  if (!Array.isArray(venues)) {
    return [];
  }

  return venues.map((venue) => enrichVenueZone(venue, zoneData, options));
}
