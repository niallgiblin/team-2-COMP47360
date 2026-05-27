import { describe, test, expect } from 'vitest';
import { DateTime } from 'luxon';
import { getFallbackForecastTimestamps } from '../forecastTimes';

describe('getFallbackForecastTimestamps', () => {
  const fixedNow = DateTime.fromISO('2026-05-27T10:15:00', { zone: 'America/New_York' });

  test('returns exactly 12 ISO strings', () => {
    const timestamps = getFallbackForecastTimestamps(fixedNow);

    expect(Array.isArray(timestamps)).toBe(true);
    expect(timestamps).toHaveLength(12);
    timestamps.forEach((ts) => {
      expect(typeof ts).toBe('string');
      expect(DateTime.fromISO(ts).isValid).toBe(true);
    });
  });

  test('first timestamp is the next New York hour', () => {
    const timestamps = getFallbackForecastTimestamps(fixedNow);
    const first = DateTime.fromISO(timestamps[0]).setZone('America/New_York');

    expect(first.hour).toBe(11);
    expect(first.minute).toBe(0);
    expect(first.day).toBe(27);
    expect(first.month).toBe(5);
  });

  test('twelfth timestamp is 11 hours after the first', () => {
    const timestamps = getFallbackForecastTimestamps(fixedNow);
    const first = DateTime.fromISO(timestamps[0]).setZone('America/New_York');
    const twelfth = DateTime.fromISO(timestamps[11]).setZone('America/New_York');

    expect(twelfth.diff(first, 'hours').hours).toBe(11);
  });

  test('respects custom count and zone parameters', () => {
    const timestamps = getFallbackForecastTimestamps(fixedNow, 6, 'America/New_York');

    expect(timestamps).toHaveLength(6);
    const first = DateTime.fromISO(timestamps[0]).setZone('America/New_York');
    expect(first.zoneName).toBe('America/New_York');
  });
});
