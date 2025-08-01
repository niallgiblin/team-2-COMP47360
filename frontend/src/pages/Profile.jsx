import { useState, useEffect } from 'react';
import {
  Tabs,
  Tab,
  Container,
  Box,
  Paper,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import ProfileForm from '../components/ProfileForm';
import FriendsList from '../components/FriendsList';
import FavouriteVenues from '../components/FavouriteVenues';
import SavedPlans from '../components/SavedPlans';
import SharedPlans from '../components/SharedPlans';



// Custom styling for each Tab
const tabStyles = {
  textTransform: 'uppercase',       // Make text uppercase
  fontWeight: 'bold',               // Bold font
  color: '#BBB',                    // Default text color
  minWidth: 120,                    // consistent width
  position: 'relative',             

  // Styling for the selected tab only
  '&.Mui-selected': {
    background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)', // Gradient text
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: '#FFF',                      // Fallback for browsers not supporting gradient
  },

  // Fix for unwanted vertical focus outlines or borders
  '&:focus': {
    outline: 'none',
    border: 'none',
  },

  // Remove any left/right borders
  borderLeft: 'none',
  borderRight: 'none',
};

export default function Profile() {
  const location = useLocation();
  const queryTab = new URLSearchParams(window.location.search).get('tab');

  const [tabIndex, setTabIndex] = useState(() => {
    if (location.state?.showSavedPlans) return 3;
    if (location.state?.showFriendsTab || queryTab === 'friends') return 1;
    if (location.state?.showSharedPlans) return 4;
    return 0;
  });

  useEffect(() => {
    if (location.state?.showSavedPlans) {
      window.history.replaceState({}, document.title); // clears navigation state
    }
  }, []);

  const handleTabChange = (_, newValue) => {
    setTabIndex(newValue);
  };

  return (
    <Container maxWidth="md" sx={{ mb: 10 }} data-testid="profile-form">
      <Paper
        elevation={4}
        sx={{
          mt: 4,
          borderRadius: 3,
          backgroundColor: '#000000', // Outer background (black)
          color: '#FFF', // text colour (white)
          px: { xs: 2, sm: 4 },
          pt: 2,
          pb: 4,
        }}
      >
        <Tabs
          value={tabIndex}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            borderBottom: '1px solid #333', // Divider under tabs
            mb: 3,

            // Style the underline indicator
            '& .MuiTabs-indicator': {
              height: '3px',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)', 
            },
          }}
        >
          {/* Each Tab uses the same gradient/text style */}
          <Tab label="Edit Profile" sx={tabStyles} />
          <Tab label="Friends" sx={tabStyles} />
          <Tab label="Favourite Venues" sx={tabStyles} />
          <Tab label="Saved Plans" sx={tabStyles} />
          <Tab label="Shared With Me" sx={tabStyles} />
        </Tabs>

        {/* Tab Panels */}
        <Box hidden={tabIndex !== 0}>
          <ProfileForm />
        </Box>
        <Box hidden={tabIndex !== 1}>
          <FriendsList />
        </Box>
        <Box hidden={tabIndex !== 2}>
          <FavouriteVenues />
        </Box>
        <Box hidden={tabIndex !== 3}>
          <SavedPlans />
        </Box>
        <Box hidden={tabIndex !== 4}>
          <SharedPlans />
        </Box>
      </Paper>
    </Container>
  );
}
