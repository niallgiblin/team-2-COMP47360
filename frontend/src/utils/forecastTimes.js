import { DateTime } from 'luxon';

/**
 * Generate hourly forecast fallback timestamps in the given timezone.
 * Starts at the next full hour after `now`.
 */
export function getFallbackForecastTimestamps(
  now = DateTime.now(),
  count = 12,
  zone = 'America/New_York',
) {
  const zonedNow = now.setZone(zone);
  const baseDate = zonedNow.startOf('hour').plus({ hours: 1 });

  return Array.from({ length: count }, (_, i) =>
    baseDate.plus({ hours: i }).toISO(),
  );
}
