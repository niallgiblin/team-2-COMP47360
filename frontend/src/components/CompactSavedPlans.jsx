import { Box, Typography, Button, IconButton } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { usePlan } from '../context/PlanContext';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';

export default function CompactSavedPlans({ setViewMode }) {
  const { savedPlans, loadPlan } = usePlan();
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const handleScroll = (direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = 300;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  if (!savedPlans || savedPlans.length === 0) {
    return (
      <Typography 
        sx={{ 
            mt: 2, 
            color: '#888', 
            textAlign: 'center' 
        }}
    >
        You haven’t saved any plans yet.
      </Typography>
    );
  }

  return (
    <Box>
      <Typography
        variant="subtitle1"
        sx={{
          color: '#fff',
          fontWeight: 'bold',
          mb: 1,
        }}
      >
        Your Saved Plans
      </Typography>

      <Box 
        sx={{ 
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
        }}
    >
        {/* Left chevron */}
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
            '&:hover': {
                backgroundColor: '#111',
            },
          }}
        >
          <ChevronLeft />
        </IconButton>

        {/* Right chevron */}
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
            '&:hover': {
                backgroundColor: '#111',
            },
          }}
        >
          <ChevronRight />
        </IconButton>

        {/* Scrollable cards */}
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
          {savedPlans.map((plan) => (
            <Box
              key={plan.id}
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
              <Typography
                variant="body1"
                sx={{ color: '#fff', fontWeight: 'bold', mb: 1 }}
              >
                {plan.name}
              </Typography>

              <Typography variant="caption" sx={{ color: '#aaa', mb: 2, display: 'block' }}>
                Saved: {new Date(plan.createdAt).toLocaleDateString()}
              </Typography>

              <Button
                fullWidth
                onClick={() => {
                  loadPlan(plan);
                  setViewMode('plan'); // switch back to Current Plan tab
                  navigate('/map', { state: { fromPlan: true } });
                }}
                variant="contained"
                sx={{
                  mt: 1,
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

