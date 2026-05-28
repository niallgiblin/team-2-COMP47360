import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authFetch, vibeAPI } from '../../services/apiService';
import {
  BUSYNESS_SESSION_TTL_MS,
  BUSYNESS_SESSION_MAX_BYTES,
} from '../utils/boundedCache';
import { useAuth } from '../hooks/useAuth';

const BusynessContext = createContext();

export const useBusyness = () => {
  const context = useContext(BusynessContext);
  if (!context) {
    throw new Error('useBusyness must be used within a BusynessProvider');
  }
  return context;
};

export const BusynessProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [busynessData, setBusynessData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [venueData, setVenueData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Add request deduplication
  const pendingRequestRef = useRef(null);
  const cacheKey = 'venueBusynessCache_v3';

  const hasForecastData = (predictions) =>
    Array.isArray(predictions) && predictions.length > 0;

  // Load cached data on mount once the user is authenticated
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      return;
    }

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { busynessData: cachedBusyness, predictionData: cachedPrediction, venueData: cachedVenues, lastFetchTime: cachedTime } = JSON.parse(cached);
        if (
          cachedTime &&
          Date.now() - cachedTime < BUSYNESS_SESSION_TTL_MS &&
          hasForecastData(cachedPrediction)
        ) {
          setBusynessData(cachedBusyness);
          setPredictionData(cachedPrediction);
          setVenueData(cachedVenues);
          setLastFetchTime(cachedTime);
          setIsInitialized(true);

          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load cached data:', err);
    }

    // If no cache, expired, or missing forecast — fetch fresh data
    fetchAllData();
  }, [authLoading, isAuthenticated]);

  // Save data to sessionStorage whenever it changes (skip incomplete forecast snapshots)
  useEffect(() => {
    if (busynessData && venueData && hasForecastData(predictionData)) {
      try {
        const cacheData = {
          busynessData,
          predictionData,
          venueData,
          lastFetchTime: Date.now()
        };
        const serialized = JSON.stringify(cacheData);
        if (serialized.length > BUSYNESS_SESSION_MAX_BYTES) {
          console.warn(
            'Busyness session snapshot exceeds size guard; skipping sessionStorage persist'
          );
          return;
        }
        sessionStorage.setItem(cacheKey, serialized);
      } catch (err) {
        console.warn('Failed to save data to cache:', err);
      }
    }
  }, [busynessData, predictionData, venueData]);

  const fetchAllData = async () => {
    // If we have recent data (less than 30 minutes old) with forecast, use cached state
    if (
      lastFetchTime &&
      Date.now() - lastFetchTime < BUSYNESS_SESSION_TTL_MS &&
      hasForecastData(predictionData)
    ) {
      return { busynessData, predictionData, venueData };
    }

    // If we're already loading, wait for the existing request
    if (isLoading) {
      
      if (pendingRequestRef.current) {
        try {
          const result = await pendingRequestRef.current;
          return result;
        } catch (error) {
          console.error('Error waiting for existing fetch:', error);
        }
      }
    }

    // Check if there's already a pending request
    if (window.venueBusynessFetchPromise) {
      
      try {
        const result = await window.venueBusynessFetchPromise;
        return result;
      } catch (error) {
        console.error('Error waiting for existing fetch:', error);
      }
    }

    setIsLoading(true);
    setError(null);

    // Create a promise for this fetch and store it globally
    const fetchPromise = (async () => {
      try {
  
        
        // Fetch both busyness and venue data in parallel
        const [busynessResponse, venueResponse] = await Promise.all([
          authFetch(vibeAPI.mapDataUrl()),
          authFetch(vibeAPI.trendingUrl())
        ]);
        
        if (!busynessResponse.ok || !venueResponse.ok) {
          throw new Error(`HTTP error! busyness: ${busynessResponse.status}, venue: ${venueResponse.status}`);
        }
        
        const [busynessData, venueData] = await Promise.all([
          busynessResponse.json(),
          venueResponse.json()
        ]);
        

        
        // Process busyness data
        let processedBusynessData = [];
        if (busynessData.busyness) {
          processedBusynessData = Object.entries(busynessData.busyness).map(([locationId, busynessValue]) => ({
            LocationID: String(locationId),
            busyness: busynessValue,
          }));
        }
        
        // Process prediction data (forecast)
        let processedPredictionData = [];
        if (busynessData.predictions) {
          processedPredictionData = busynessData.predictions;
  
        }
        
        // Process venue data
        const venues = venueData.locations || venueData;
        
        // Import turf functions for geo-lookup
        const booleanPointInPolygon = (await import('@turf/boolean-point-in-polygon')).default;
        const { point: turfPoint } = await import('@turf/helpers');
        
        // Load zone data for geo-lookup
        let zoneData = null;
        try {
          const zoneResponse = await fetch("/manhattanZones.geojson");
          zoneData = await zoneResponse.json();
        } catch (err) {
          console.warn('[CONTEXT DEBUG] Failed to load zone data for geo-lookup:', err);
        }
        
        const processedVenueData = venues.map(venue => {
          const processed = {
            ...venue,
            id: venue.id || venue.placeId,
            latitude: venue.latitude || venue.lat,
            longitude: venue.longitude || venue.lng,
            address: venue.address || 'No address provided',
            zone: venue.zone || venue.Zone || 'Unknown',
          };
          
          // Add zoneId using geo-lookup if not present
          if (!processed.zoneId && processed.latitude && processed.longitude && zoneData) {
            try {
              const venuePoint = turfPoint([processed.longitude, processed.latitude]);
              const matchingZone = zoneData.features.find(feature => 
                booleanPointInPolygon(venuePoint, feature.geometry)
              );
              if (matchingZone) {
                processed.zoneId = String(matchingZone.properties.LocationID);
              }
            } catch (err) {
              console.warn(`[CONTEXT DEBUG] Geo-lookup failed for venue '${processed.name}':`, err);
            }
          }
          
          return processed;
        });
        
        // Enrich venues with busyness data
        const enrichedVenues = processedVenueData.map(venue => {
          const zoneKey = venue.zoneId ? String(venue.zoneId) : venue.zone;
          const busynessEntry = processedBusynessData.find(item => 
            String(item.LocationID) === zoneKey
          );
          
          return {
            ...venue,
            busynessValue: busynessEntry ? busynessEntry.busyness : null,
            busynessLabel: busynessEntry ? getBusynessLabel(busynessEntry.busyness) : 'No Data'
          };
        });
        
        setBusynessData(processedBusynessData);
        setPredictionData(processedPredictionData);
        setVenueData(enrichedVenues);
        setLastFetchTime(Date.now());
        setIsInitialized(true);
        

        
        return { 
          busynessData: processedBusynessData, 
          predictionData: busynessData.predictions || [],
          venueData: enrichedVenues
        };
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
        // Clear the global promise
        window.venueBusynessFetchPromise = null;
        pendingRequestRef.current = null;
      }
    })();

    // Store the promise globally so other components can wait for it
    window.venueBusynessFetchPromise = fetchPromise;
    pendingRequestRef.current = fetchPromise;

    return fetchPromise;
  };

  const getBusynessLabel = (value) => {
    if (typeof value !== "number") return "No Data";
    const percent = value * 100;
    if (percent >= 75) return "Very Busy";
    if (percent >= 50) return "Busy";
    if (percent >= 25) return "Moderate";
    return "Quiet";
  };

  const clearCache = () => {
    setBusynessData(null);
    setPredictionData(null);
    setVenueData(null);
    setLastFetchTime(null);
    setIsInitialized(false);
    sessionStorage.removeItem(cacheKey);
    
  };

  const value = {
    busynessData,
    predictionData,
    venueData,
    isLoading,
    error,
    lastFetchTime,
    isInitialized,
    fetchAllData,
    clearCache,
    getBusynessLabel
  };

  return (
    <BusynessContext.Provider value={value}>
      {children}
    </BusynessContext.Provider>
  );
}; 