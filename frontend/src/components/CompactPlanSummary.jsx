// provides a horizontally scrollable summary of the user's plan.
// displays each venue in the plan, using the compact variant from VenueCard.jsx
// is rendered in the Current Plan on the MapView

import { Box, Typography, IconButton } from '@mui/material';
import { usePlan } from '../context/PlanContext';                   // context hook for accessing the current plan
import { useAuth } from '../hooks/useAuth';                         // hook to get user's data
import VenueCard from './VenueCard';                                // import VenueCard component
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useRef } from 'react';

export default function CompactPlanSummary() {
  const { plan } = usePlan();
  const { user } = useAuth();  

  const scrollRef = useRef(null);

  // Defensive: ensure plan is always an array
  const planArray = Array.isArray(plan) ? plan : (plan?.venues || []);

  // plan title using the user's first name if available
  const planTitle = user?.firstName
    ? `Plan for ${user.firstName}`
    : 'Your Plan';

  if (!planArray || planArray.length === 0) return null;

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <Box 
      sx={{ 
        px: 2, 
        pt: 2,
        position: 'relative' 
      }}
    >
      {/* Title */}
      <Typography
        variant="h6"
        sx={{
          color: '#fff',
          fontWeight: 'bold',
          mb: 1,
        }}
      >
        {planTitle}
      </Typography>

      {/* Chevron Buttons */}
      <IconButton
        onClick={scrollLeft}
        sx={{
          position: 'absolute',
          left: -10,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          color: '#FF4ECD',
          backgroundColor: '#000',
          '&:hover': {
            backgroundColor: '#111',
          },
        }}
      >
        <ChevronLeftIcon />
      </IconButton>

      <IconButton
        onClick={scrollRight}
        sx={{
          position: 'absolute',
          right: -10,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          color: '#FF4ECD',
          backgroundColor: '#000',
          '&:hover': {
            backgroundColor: '#111',
          },
        }}
      >
        <ChevronRightIcon />
      </IconButton>
      
      {/* Venue cards (horizontal scroll) */}
      <Box
        ref={scrollRef}
        sx={{
          display: 'flex',
          overflowX: 'auto',
          overflowY: 'visible',
          gap: 2,
          pb: 1,
          scrollBehavior: 'smooth',
        }}
      >
        {planArray.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="compact" /> // No handlers needed here anymore as they are global now
        ))}
      </Box>
    </Box>
  );
}
