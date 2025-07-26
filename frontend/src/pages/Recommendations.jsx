import { useState, useEffect } from 'react';
import PageWrapper from '../components/PageWrapper';
import { Typography, Box } from '@mui/material';
import TrendingVenueCard from '../components/TrendingVenueCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../hooks/useAuth";
import { useBusyness } from "../context/BusynessContext";

// Turf imports
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

export default function Recommendations() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [busynessMap, setBusynessMap] = useState([]);

  const navigate = useNavigate();
  const { makeAuthenticatedRequest } = useAuth();
  const { busynessData: contextBusynessData, fetchBusynessData } = useBusyness();
  


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
  }, []); // Empty dependency array - only run once on mount

  // Handle context data updates separately
  useEffect(() => {
    if (contextBusynessData && contextBusynessData.length > 0) {
      const busynessMapFromContext = {};
      contextBusynessData.forEach(item => {
        const zoneId = String(item.LocationID).replace(" NET", "");
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

      setVenues(transformed);

    } catch (err) {
      console.warn('Falling back to mock data due to error:', err);
      try {
        const res = await fetch('/mock/venues.json');
        const mockData = await res.json();
        const transformed = mockData.map((v) => ({
          ...v,
          latitude: v.lat,
          longitude: v.lng,
          address: v.address || 'No address provided',
        }));
        setVenues(transformed);
        setIsMock(true);
      } catch (mockErr) {
        console.error('Error loading mock data:', mockErr);
      }
    } finally {
      setLoading(false);
    }
  };

  fetchAllData();
}, [makeAuthenticatedRequest]); // Only depend on auth function

  if (loading) {
    return (
      <PageWrapper>
        <Typography sx={{ color: 'white', p: 4 }}>
          Loading trending venues...
        </Typography>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Box sx={{ maxWidth: 700, mx: 'auto', mt: 0, mb: 10, px: 2 }}>
        <Typography variant="h4" sx={{ color: '#fff', mb: 2, textAlign: 'center' }}>
          What’s Hot Tonight
        </Typography>

        <Typography variant="body2" sx={{ color: '#aaa', mb: 3, textAlign: 'center' }}>
          See the top trending venues based on footfall, reviews, and vibe activity.
        </Typography>

        {isMock && (
          <Typography variant="body2" sx={{ color: 'orange', mb: 2, textAlign: 'center' }}>
            (Mock data displayed — backend unavailable)
          </Typography>
        )}

        {venues.map((venue, index) => (
          <TrendingVenueCard
            key={venue.id || index}
            venue={venue}
            busynessMap={busynessMap}
            rank={index + 1}
            onGetDirections={handleGetDirections}
          />
        ))}
      </Box>
    </PageWrapper>
  );
}
