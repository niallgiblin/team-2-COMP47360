import { useState } from 'react';
import { Box } from '@mui/material';
import PageWrapper from '../components/PageWrapper';
import VenueCard from '../components/VenueCard';
import DemoMap from '../components/DemoMap';
import venueData from '../data/mockVenues'; // mock JSON data for now

// Map View component - page that combines the interactive map and venue details
export default function MapView() {
  // useState is React's hook, which allows you to store and update data inside a functional component
  // selectedVenue is the current state value - the venue that is displayed in the card
  // setSelectedVenue - function to update the selectedVenue
  // useState(venueData[0]) sets initial value to the first item in the array
  const [selectedVenue, setSelectedVenue] = useState(venueData[0]);

  return (
    <PageWrapper>
      {/* Outer flex container, dividing the screen into two horizontal  sections */}
      <Box 
        sx={{ 
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row'}, // responsive layout 
          height: { xs: 'auto', md: 'calc(100vh - 64px)' }, //outer container height
          border: '3px solid #822869',
          borderRadius: 2,
          overflow: 'hidden', 
          maxWidth: '1200px',
          mx: 'auto', // center horizontally
          mb: 8,
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
          <DemoMap venues={venueData} onSelectVenue={setSelectedVenue} /> 
        </Box>
      </Box>
    </PageWrapper>
  );
}


