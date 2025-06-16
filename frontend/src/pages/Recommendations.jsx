import { useState, useEffect } from 'react';
import PageWrapper from '../components/PageWrapper';
import { Typography, Box } from '@mui/material';
import TrendingVenueCard from '../components/TrendingVenueCard';
import { useNavigate } from 'react-router-dom';

export default function Recommendations() {
  const [venues, setVenues] = useState([]);         // Store fetched venue data
  const [loading, setLoading] = useState(true);     // Track loading state
  const [isMock, setIsMock] = useState(false);      // Flag to show if using mock fallback
  const navigate = useNavigate();
  const handleGetDirections = (venue) => {
  navigate('/map', { state: { selectedVenue: venue } });
  };

  // Fetch venue data from mock JSON file
  useEffect(() => {
    fetch('http://localhost:8080/api/location/trending')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch venue data');
        return res.json();
      })
      .then((data) => {
        setVenues(data);         // Save data to state
        setLoading(false);       // Stop showing loading message
      })
      .catch(async (err) => {
        console.warn('Falling back to mock data de to fetch error:', err);
        
        try {
          const res = await fetch('/mock/venues.json');
          const mockData = await res.json();

          // Transform fields to match what your components expect
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
        
        setLoading(false);
      });
  }, []);


  if (loading) {
    return (
      <PageWrapper>
        <Typography 
          sx={{ 
            color: 'white', 
            p: 4 
          }}
        >
          Loading trending venues...
        </Typography>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Box 
        sx={{ 
          maxWidth: 500, 
          mx: 'auto', 
          mt: 0,
          mb: 10,
          px: 2
        }}
      >
        <Typography variant="h4" 
          sx={{ 
            color: '#fff', 
            mb: 2,
            textAlign: 'center' 
          }}
          >
          What’s Hot Tonight
        </Typography>

        <Typography variant="body2" 
          sx={{ 
            color: '#aaa', 
            mb: 3,
            textAlign: 'center' 
            }}
          >
          See the top trending venues based on footfall, reviews, and vibe activity.
        </Typography>

        {/* Notice if mock data is being used */}
        {isMock && (
          <Typography
            variant="body2"
            sx={{ 
              color: 'orange', 
              mb: 2, 
              textAlign: 'center' 
            }}
          >
            (Mock data displayed — backend unavailable)
          </Typography>
        )}
        
        {/* Display trending venues */}
        {venues.map((venue, index) => (
          <TrendingVenueCard
            key={venue.id}
            venue={venue}
            rank={index + 1}
            onGetDirections={handleGetDirections}
          />
        ))}
      </Box>
    </PageWrapper>
  );
}

