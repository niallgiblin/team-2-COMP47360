import { useState, useEffect, useCallback } from 'react';
import PageWrapper from '../components/PageWrapper';
import { Typography, Box } from '@mui/material';
import TrendingVenueCard from '../components/TrendingVenueCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../hooks/useAuth";
import { useBusyness } from "../context/BusynessContext";

// Turf imports
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

// Cache for trending data
const trendingCache = {
  data: null,
  timestamp: null,
  duration: 5 * 60 * 1000 // 5 minutes
};

export default function Recommendations() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [busynessMap, setBusynessMap] = useState([]);

  const navigate = useNavigate();
  const { makeAuthenticatedRequest } = useAuth();
  const { busynessData: contextBusynessData, fetchBusynessData } = useBusyness();

  // Check if we have cached trending data
  const getCachedTrendingData = useCallback(() => {
    if (trendingCache.data && 
        trendingCache.timestamp && 
        Date.now() - trendingCache.timestamp < trendingCache.duration) {
      return trendingCache.data;
    }
    return null;
  }, []);

  // Fetch busyness data on mount (only once)
  useEffect(() => {
    const loadBusynessData = async () => {
      try {
        await fetchBusynessData();
      } catch (error) {
        console.error('Failed to load busyness data:', error);
      }
    };
    loadBusynessData();
  }, [fetchBusynessData]);

  // Handle context data updates - create a more efficient map
  useEffect(() => {
    if (contextBusynessData && contextBusynessData.length > 0) {
      const busynessMapFromContext = {};
      contextBusynessData.forEach(item => {
        const zoneId = String(item.LocationID);
        busynessMapFromContext[zoneId] = item.busyness;
      });
      setBusynessMap(busynessMapFromContext);
    } else {
      setBusynessMap({});
    }
  }, [contextBusynessData]);

  const handleGetDirections = (venue) => {
    navigate('/map', { state: { selectedVenue: venue } });
  };

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      
      // Check cache first
      const cachedData = getCachedTrendingData();
      if (cachedData) {
        setVenues(cachedData);
        setLoading(false);
        return;
      }

      try {
        // 1. Fetch static zone data
        const zoneResponse = await fetch('/manhattanZones.geojson');
        if (!zoneResponse.ok) throw new Error('Failed to load zone data');
        const zoneData = await zoneResponse.json();

        // 2. Fetch authenticated data now that prerequisites are loaded
        const res = await makeAuthenticatedRequest(`/api/vibe/trending`);
        if (!res.ok) throw new Error('Failed to fetch venue data');
        
        const data = await res.json();
        const venues = data.locations || data;

        // 3. Enrich the venue data with zone information
        const transformed = venues.map((venue) => {
          const enriched = {
            ...venue,
            id: venue.id || venue.placeId,
            latitude: venue.latitude || venue.lat,
            longitude: venue.longitude || venue.lng,
            address: venue.address || 'No address provided',
            zone: venue.zone || venue.Zone || 'Unknown',
          };

          if (zoneData && enriched.latitude && enriched.longitude) {
            const venuePoint = turfPoint([enriched.longitude, enriched.latitude]);
            const matchingZone = zoneData.features.find((feature) =>
              booleanPointInPolygon(venuePoint, feature.geometry)
            );
            if (matchingZone) {
              enriched.zoneId = matchingZone.properties.LocationID;
            }
          }
          return enriched;
        });

        // Cache the transformed data
        trendingCache.data = transformed;
        trendingCache.timestamp = Date.now();

        setVenues(transformed);

      } catch (err) {
        console.warn('Falling back to mock data due to error:', err);
        try {
          const res = await fetch('/mock/venues.json');
          const mockData = await res.json();
          setVenues(mockData);
          setIsMock(true);
        } catch (mockErr) {
          console.error('Failed to load mock data:', mockErr);
          setVenues([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [makeAuthenticatedRequest, getCachedTrendingData]);

  if (loading) {
    return (
      <PageWrapper>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Typography>Loading trending venues...</Typography>
        </Box>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Box sx={{ maxWidth: 1000, mx: 'auto', mb: 10, px: 2 }}>
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{
            fontWeight: 'bold',
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          What's Hot Tonight
        </Typography>
        
        <Typography
          variant="body2"
          align="center"
          sx={{ mb: 4, color: '#aaa' }}
        >
          {isMock ? 'Showing sample trending venues' : 'See the top trending venues based on footfall, reviews, and vibe activity.'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {venues.map((venue, index) => (
            <TrendingVenueCard
              key={venue.id || index}
              venue={venue}
              busynessMap={busynessMap}
              rank={index + 1}
              onGetDirections={handleGetDirections}
              tags={venue.tags}
              hidePlanButtons={false}
            />
          ))}
        </Box>
      </Box>
    </PageWrapper>
  );
}
