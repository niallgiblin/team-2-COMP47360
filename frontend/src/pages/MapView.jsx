import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import PageWrapper from '../components/PageWrapper';
import VenueCard from '../components/VenueCard';
import DemoMap from '../components/DemoMap';
import { useLocation } from 'react-router-dom';


import mockVenues from '../data/mockVenues'; // fallback mock JSON data


// Map View page 
// fetches and displays venue data
// allows the user to interact with a map and venue details

export default function MapView() {

  // const location = useLocation();
  // const selectedVenueFromState = location.state?.selectedVenue;

  // state for venue list
  const [venues, setVenues] = useState([]);
  
  // state for selected venue, displayed in the left panel
  const [selectedVenue, setSelectedVenue] = useState(null);
  
  // state to manage loading screen
  const [loading, setLoading] = useState(true);

  // state to track if mock data is being used
  const [isMock, setIsMock] = useState(false);

  // Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/locations');
  
        if (!res.ok) throw new Error('Server error');
  
        const data = await res.json();
  
        setVenues(data);
        setSelectedVenue(data[0]);
      } catch (err) {
        console.warn('Falling back to mock data due to fetch error:', err);
        setVenues(mockVenues);
        setSelectedVenue(mockVenues[0]);
        setIsMock(true);
      } finally {
        setLoading(false);
      }
    };
  
    fetchData();
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
          {isMock && (
          <Box sx={{ color: 'orange', p: 1 }}>
            You are viewing mock venue data. Backend not connected.
          </Box>
        )}

          {/* When a marker is clicked, calls setSelectedVenue to update the left*/}
          <DemoMap 
            venues={venues} 
            selectedVenue={selectedVenue}
            onSelectVenue={setSelectedVenue} /> 
        </Box>
      </Box>
    </PageWrapper>
  );
}


