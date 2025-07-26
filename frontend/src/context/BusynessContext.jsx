import React, { createContext, useContext, useState, useEffect } from 'react';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Load cached data from sessionStorage on mount and fetch fresh data if needed
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('busynessCache');
      if (cached) {
        const parsed = JSON.parse(cached);
        setBusynessData(parsed.busynessData);
        setPredictionData(parsed.predictionData);
        setLastFetchTime(parsed.lastFetchTime);
        console.log('🔍 [CACHE] Loaded busyness data from sessionStorage');
      }
    } catch (err) {
      console.warn('Failed to load cached busyness data:', err);
    }
    
    // Always try to fetch fresh data on mount (will use cache if recent)
    fetchBusynessData();
  }, []);

  // Save data to sessionStorage whenever it changes
  useEffect(() => {
    if (busynessData && predictionData) {
      try {
        const cacheData = {
          busynessData,
          predictionData,
          lastFetchTime: Date.now()
        };
        sessionStorage.setItem('busynessCache', JSON.stringify(cacheData));
      } catch (err) {
        console.warn('Failed to save busyness data to cache:', err);
      }
    }
  }, [busynessData, predictionData]);

  const fetchBusynessData = async () => {
    // If we have recent data (less than 10 minutes old), use cached data
    if (lastFetchTime && Date.now() - lastFetchTime < 10 * 60 * 1000) {
      console.log('🔍 [CACHE] Using cached busyness data (age:', Math.round((Date.now() - lastFetchTime) / 1000), 'seconds)');
      return { busynessData, predictionData };
    }

    // If we're already loading, don't start another request
    if (isLoading) {
      console.log('🔍 [CACHE] Busyness data already loading, returning cached data');
      return { busynessData, predictionData };
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/vibe/map-data');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.busyness && data.predictions) {
        // Convert busyness object to array format for consistency
        const busynessArray = Object.entries(data.busyness).map(([locationId, busynessValue]) => ({
          LocationID: String(locationId),
          busyness: busynessValue,
        }));
        
        setBusynessData(busynessArray);
        setPredictionData(data.predictions);
        setLastFetchTime(Date.now());
        console.log('🔍 [CACHE] Successfully fetched and cached new busyness data');
        return { busynessData: busynessArray, predictionData: data.predictions };
      } else {
        throw new Error('Invalid data structure received from API');
      }
    } catch (err) {
      console.error('🔍 [CACHE] Error fetching busyness data:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const clearCache = () => {
    setBusynessData(null);
    setPredictionData(null);
    setLastFetchTime(null);
    sessionStorage.removeItem('busynessCache');
    console.log('🔍 [CACHE] Cleared busyness cache');
  };

  const value = {
    busynessData,
    predictionData,
    isLoading,
    error,
    lastFetchTime,
    fetchBusynessData,
    clearCache
  };

  return (
    <BusynessContext.Provider value={value}>
      {children}
    </BusynessContext.Provider>
  );
}; 