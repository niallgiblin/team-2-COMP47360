// displays plans that have been shared with the user
// uses the compact variant of VenueCard, and displays them in a horizontally scrollable format
// used on MapView

import { Box, Typography, Button, IconButton } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { usePlan } from '../context/PlanContext';
import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';

export default function CompactSharedPlans({ setViewMode }) {
  // access shared plans, loader function, flag setter from context
  const { sharedPlans, loadPlan, setFromPlan } = usePlan();
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (scrollRef.current) {
        setShowArrows(scrollRef.current.scrollWidth > scrollRef.current.clientWidth);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [sharedPlans]);

  // handles horizontal scrolling
  const handleScroll = (direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = 300;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  // show fallback message if there are no shared plans
  if (!sharedPlans || sharedPlans.length === 0) {
    return (
      <Typography 
        sx={{ 
          mt: 2, 
          color: '#888', 
          textAlign: 'center' 
        }}
      >
        No plans have been shared with you yet.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Headding */}
      <Typography
        variant="subtitle1"
        sx={{
          color: '#fff',
          fontWeight: 'bold',
          mb: 1,
        }}
      >
        Plans Shared With You
      </Typography>

      {/* Container for cards and chevrons*/}
      <Box 
        sx={{ 
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Left chevron */}
        {showArrows && (
          <IconButton
            onClick={() => handleScroll('left')}
            sx={{
              position: 'absolute',
              left: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              color: '#FF4ECD',
              backgroundColor: '#000',
              '&:hover': { backgroundColor: '#111' },
            }}
          >
            <ChevronLeft />
          </IconButton>
        )}

        {/* Right chevron */}
        {showArrows && (
          <IconButton
            onClick={() => handleScroll('right')}
            sx={{
              position: 'absolute',
              right: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              color: '#FF4ECD',
              backgroundColor: '#000',
              '&:hover': { backgroundColor: '#111' },
            }}
          >
            <ChevronRight />
          </IconButton>
        )}

        {/* Scrollable container for venue cards */}
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            position: 'relative',
            overflowX: 'auto',
            gap: 2,
            pb: 1,
            px: 2,
          }}
        >
          {sharedPlans.map((item) => (
            <Box
              key={item.plan.id}
              sx={{
                minWidth: 180,
                maxWidth: 250,
                backgroundColor: '#111',
                border: '1px solid #900B6A',
                borderRadius: 2,
                p: 2,
                flexShrink: 0,
              }}
            >
              {/* PLan name */}
              <Typography
                variant="body1"
                sx={{ color: '#fff', fontWeight: 'bold', mb: 1 }}
              >
                {item.plan.name}
              </Typography>

              {/* Username of the user who shared the plan */}
              <Typography variant="caption" sx={{ color: '#aaa', mb: 1, display: 'block' }}>
                Shared by @{item.sharedBy?.username || 'Unknown'}
              </Typography>

              {/* Date plan was shared */}
              <Typography variant="caption" sx={{ color: '#aaa', display: 'block' }}>
                Shared on: {new Date(item.plan.createdAt).toLocaleDateString()}
              </Typography>

              {/* View on map button */}
              <Button
                fullWidth
                onClick={() => {
                  loadPlan(item.plan.venues);
                  setFromPlan(true);
                  if (setViewMode) setViewMode('plan');
                  navigate('/map', { state: { fromPlan: true } });
                }}
                variant="contained"
                sx={{
                  mt: 2,
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  fontWeight: 'bold',
                  color: '#000',
                  textTransform: 'none',
                }}
              >
                View on Map
              </Button>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
