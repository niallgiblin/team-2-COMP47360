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

  // Load cached data on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('busynessCache');
      if (cached) {
        const { busynessData: cachedBusyness, predictionData: cachedPrediction, lastFetchTime: cachedTime } = JSON.parse(cached);
        if (cachedTime && Date.now() - cachedTime < 10 * 60 * 1000) {
          setBusynessData(cachedBusyness);
          setPredictionData(cachedPrediction);
          setLastFetchTime(cachedTime);
        }
      }
    } catch (err) {
      console.warn('Failed to load cached busyness data:', err);
    }
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
      return { busynessData, predictionData };
    }

    // If we're already loading, don't start another request
    if (isLoading) {
      return { busynessData, predictionData };
    }

    // Check if there's already a pending request
    if (window.busynessFetchPromise) {
      try {
        const result = await window.busynessFetchPromise;
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
        const response = await fetch('/api/vibe/map-data');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // The backend returns busyness data in the 'busyness' field
        if (data.busyness) {
          // Convert busyness object to array format for consistency
          const busynessArray = Object.entries(data.busyness).map(([locationId, busynessValue]) => ({
            LocationID: String(locationId),
            busyness: busynessValue,
          }));
          
          setBusynessData(busynessArray);
          setPredictionData(data.predictions || []);
          setLastFetchTime(Date.now());
          return { busynessData: busynessArray, predictionData: data.predictions || [] };
        } else {
          console.warn('No busyness data found in response:', data);
          setBusynessData([]);
          setPredictionData([]);
          return { busynessData: [], predictionData: [] };
        }
      } catch (err) {
        console.error('Error fetching busyness data:', err);
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
        // Clear the global promise
        window.busynessFetchPromise = null;
      }
    })();

    // Store the promise globally so other components can wait for it
    window.busynessFetchPromise = fetchPromise;

    return fetchPromise;
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