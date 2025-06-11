import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import PageWrapper from '../components/PageWrapper';
import VenueCard from '../components/VenueCard';
import DemoMap from '../components/DemoMap';
// import venueData from '../data/mockVenues'; // mock JSON data for now

// import venueData from '../data/mockVenues'; // mock JSON data for now

// Map View page 
// fetches and displays venue data
// allows the user to interact with a map and venue details

export default function MapView() {

  // state for venue list
  const [venues, setVenues] = useState([]);
  
  // state for selected venue, displayed in the left panel
  const [selectedVenue, setSelectedVenue] = useState(null);
  
  // state to manage loading screen
  const [loading, setLoading] = useState(true);

  
  // Data Fetching
  useEffect(() => {
    fetch('http://localhost:8080/api/locations')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json(); // parse JSON from response
      })
      .then(data => {
        setVenues(data); // Save venues
        if (data.length > 0) {
          setSelectedVenue(data[0]); // Select the first venue by default
        }
        setLoading(false); // Done loading
      })
      .catch(err => {
        console.error('Failed to fetch venue data:', err);
        setLoading(false); // stop loading if there's an error
      });
  }, []);
  
  // Loading screen
  // Show placeholder message while data is being fetched
  if (loading) 
    return 
      <PageWrapper>
        <p style={{ color: 'white' }}>Loading venues...</p>
      </PageWrapper>
    ;

  // Main page content
    return (
    <PageWrapper>
      {/* Outer flex container, dividing the screen into two horizontal  sections */}
      <Box 
        sx={{ 
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row'}, // responsive layout, stack on small screens, side-by-side on desktop 
          height: { xs: 'auto', md: 'calc(100vh - 64px)' }, //outer container height, full viewport height minus nav bar
          border: '3px solid #822869',
          borderRadius: 2,
          overflow: 'hidden', 
          maxWidth: '1200px',
          mx: 'auto', // center horizontally
          mb: 8, // margin below container
          }}
      >
        
        {/* Left panel - fixed width container for venue details */}
        <Box 
          sx={{ 
            width: { xs: '100%', md: '30%' }, // full width on small screens
            maxHeight: { xs: '60vh', md: '100%' }, 
            p: { xs: 1, md: 2 }, // smaller padding on mobile
            pr: {xs: 1},
            bgcolor: '#000000',
            overflowY: 'auto' 
          }}
        >
          <VenueCard venue={selectedVenue} />
        </Box>
        
        {/* Right panel - container for the map, takes up remaining space */}
        <Box 
          sx={{ 
            flexGrow: 1,
            height: { xs: '400px', md: 'calc(100% - 32px)' },
            p: { xs: 1, md: 2 }
            }}>
          {/* When a marker is clicked, calls setSelectedVenue to update the left*/}
          <DemoMap venues={venues} onSelectVenue={setSelectedVenue} /> 
        </Box>
      </Box>
    </PageWrapper>
  );
}


