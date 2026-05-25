import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { vibeAPI } from '../../services/apiService';

const BusynessContext = createContext();

export const useBusyness = () => {
  const context = useContext(BusynessContext);
  if (!context) {
    throw new Error('useBusyness must be used within a BusynessProvider');
  }
  return context;
};

export const BusynessProvider = ({ children }) => {
  const [busynessData, setBusynessData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [venueData, setVenueData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Add request deduplication
  const pendingRequestRef = useRef(null);
  const cacheKey = 'venueBusynessCache_v2'; // Updated cache key

  // Load cached data on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { busynessData: cachedBusyness, predictionData: cachedPrediction, venueData: cachedVenues, lastFetchTime: cachedTime } = JSON.parse(cached);
        if (cachedTime && Date.now() - cachedTime < 30 * 60 * 1000) { // 30 minute cache
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
    
    // If no cache or expired, fetch fresh data
    fetchAllData();
  }, []);

  // Save data to sessionStorage whenever it changes
  useEffect(() => {
    if (busynessData && predictionData && venueData) {
      try {
        const cacheData = {
          busynessData,
          predictionData,
          venueData,
          lastFetchTime: Date.now()
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));

      } catch (err) {
        console.warn('Failed to save data to cache:', err);
      }
    }
  }, [busynessData, predictionData, venueData]);

  const fetchAllData = async () => {
    // If we have recent data (less than 30 minutes old), use cached data
    if (lastFetchTime && Date.now() - lastFetchTime < 30 * 60 * 1000) {
      
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
          fetch(vibeAPI.mapDataUrl()),
          fetch(vibeAPI.trendingUrl())
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