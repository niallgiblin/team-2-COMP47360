import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch, vibeAPI } from '../../services/apiService';

/**
 * Custom hook to fetch Google Places reviews for a venue.
 * Caches results per venueId in a module-level Map for the session.
 * Respects Google attribution requirements.
 */
const sessionCache = new Map();

export default function useGoogleReviews(venueId) {
  const [reviews, setReviews] = useState(null);   // GooglePlacesReviewDto or null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchReviews = useCallback(async () => {
    if (!venueId) return;

    // Check session cache
    const cached = sessionCache.get(venueId);
    if (cached) {
      setReviews(cached);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(vibeAPI.googleReviewsUrl(venueId));
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (!mountedRef.current) return;

      if (data.error && !data.googleRating) {
        // Only treat as error if we got no useful data at all
        setError(data.error);
        setReviews(data);
      } else {
        setReviews(data);
        // Cache successful responses for 5 minutes
        sessionCache.set(venueId, data);
        // Auto-expire cache entry
        setTimeout(() => {
          sessionCache.delete(venueId);
        }, 5 * 60 * 1000);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [venueId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, error, refetch: fetchReviews };
}
