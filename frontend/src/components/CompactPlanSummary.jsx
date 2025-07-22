// provides a horizontally scrollable summary of the user's plan.
// displays each venue in the plan, using the compact variant from VenueCard.jsx
// is rendered in the Current Plan on the MapView

import { Box, Typography, IconButton } from '@mui/material';
import { usePlan } from '../context/PlanContext';                   // context hook for accessing the current plan
import { useAuth } from '../hooks/useAuth';                         // hook to get user's data
import VenueCard from './VenueCard';                                // import VenueCard component
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useRef, useState, useEffect } from 'react';

export default function CompactPlanSummary() {
  const { plan } = usePlan();
  const { user } = useAuth();  

  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  // Defensive: ensure plan is always an array
  const planArray = Array.isArray(plan) ? plan : (plan?.venues || []);
  console.log('CompactPlanSummary planArray:', planArray);

  // plan title using the user's first name if available
  const planTitle = user?.firstName
    ? `Plan for ${user.firstName}`
    : 'Your Plan';

  useEffect(() => {
    const checkOverflow = () => {
      if (scrollRef.current) {
        setShowArrows(scrollRef.current.scrollWidth > scrollRef.current.clientWidth);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [planArray]);

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
      {showArrows && (
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
      )}

      {showArrows && (
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
      )}
      
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
          minWidth: 0,
          maxWidth: '100%',
          pr: 2, // Add padding right so last card is not cut off
          pt: 2, // Add padding top so top of card and button are not cut off
        }}
      >
        {planArray.map((venue, idx) => (
          <VenueCard 
            key={venue.id} 
            venue={venue} 
            variant="compact" 
            disableActions={true}
            highlighted={true}
            sx={idx === planArray.length - 1 ? { marginRight: 8 } : {}} // Add marginRight to last card
          />
        ))}
      </Box>
    </Box>
  );
}
