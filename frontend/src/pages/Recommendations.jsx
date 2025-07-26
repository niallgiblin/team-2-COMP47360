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
  const { isAuthenticated } = useAuth();
  const { busynessData: contextBusynessData, venueData: cachedVenues, isInitialized, fetchAllData } = useBusyness();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // Use cached venue data if available
  useEffect(() => {
    if (isInitialized && cachedVenues && cachedVenues.length > 0) {
      setVenues(cachedVenues);
      setLoading(false);
      return;
    }

    // If no cached data, fetch it
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchAllData();
      } catch (error) {
        console.error('Failed to load data:', error);
        // Fallback to mock data
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

    loadData();
  }, [isInitialized, cachedVenues, fetchAllData]);

  // Update venues when cached data changes
  useEffect(() => {
    if (cachedVenues && cachedVenues.length > 0) {
      setVenues(cachedVenues);
    }
  }, [cachedVenues]);



  const handleGetDirections = (venue) => {
    navigate('/map', { state: { selectedVenue: venue } });
  };

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
