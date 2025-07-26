// Utility functions for handling sessionStorage with quota management

const STORAGE_KEYS = {
  ZONE_DATA: 'zoneData',
  VENUES_DATA: 'allVenues',
  BUSYNESS_CACHE: 'busynessCache',
  TRENDING_CACHE: 'trendingCache'
};

// Safe storage setter with quota management
export const safeSetItem = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn(`Storage quota exceeded for key: ${key}. Clearing old entries...`);
      
      // Try to clear old entries and retry
      try {
        // Clear all our cache keys
        Object.values(STORAGE_KEYS).forEach(storageKey => {
          sessionStorage.removeItem(storageKey);
        });
        
        // Try again
        sessionStorage.setItem(key, JSON.stringify(value));
        console.log(`Successfully cached ${key} after clearing old entries`);
        return true;
      } catch (retryError) {
        console.warn(`Failed to cache ${key} even after clearing:`, retryError.message);
        return false;
      }
    } else {
      console.warn(`Failed to cache ${key}:`, error.message);
      return false;
    }
  }
};

// Safe storage getter
export const safeGetItem = (key) => {
  try {
    const item = sessionStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.warn(`Failed to retrieve ${key} from storage:`, error.message);
    return null;
  }
};

// Clear all cache entries
export const clearAllCache = () => {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      sessionStorage.removeItem(key);
    });
    console.log('🔍 [CACHE] Cleared all cache entries');
  } catch (error) {
    console.warn('Failed to clear cache:', error.message);
  }
};

// Get storage usage info
export const getStorageInfo = () => {
  try {
    let totalSize = 0;
    const items = {};
    
    Object.values(STORAGE_KEYS).forEach(key => {
      const item = sessionStorage.getItem(key);
      if (item) {
        const size = new Blob([item]).size;
        totalSize += size;
        items[key] = {
          size: size,
          sizeKB: (size / 1024).toFixed(2)
        };
      }
    });
    
    return {
      totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      items
    };
  } catch (error) {
    console.warn('Failed to get storage info:', error.message);
    return null;
  }
};

export { STORAGE_KEYS }; 