import { useState, useEffect } from 'react';
import PageWrapper from '../components/PageWrapper';
import { Typography, Box } from '@mui/material';
import TrendingVenueCard from '../components/TrendingVenueCard';

export default function Recommendations() {
  const [venues, setVenues] = useState([]);         // Store fetched venue data
  const [loading, setLoading] = useState(true);     // Track loading state

  // Fetch venue data from mock JSON file
  useEffect(() => {
    fetch('http://localhost:8080/api/locations/trending')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch venue data');
        return res.json();
      })
      .then((data) => {
        setVenues(data);         // Save data to state
        setLoading(false);       // Stop showing loading message
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setLoading(false);
      });
  }, []);

  // Handle "Get Directions" click
  const handleGetDirections = (venue) => {
    console.log('User clicked Get Directions for:', venue.name);
    // Later navigate to MapView
  };

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

