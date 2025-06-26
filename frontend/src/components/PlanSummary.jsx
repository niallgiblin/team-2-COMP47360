// components/PlanSummary.jsx
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';
import VenueCard from './VenueCard';

export default function PlanSummary() {
  const { plan } = usePlan();
  const navigate = useNavigate();

  if (plan.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 6,
        p: 3,
        border: '2px solid #3ABEFF',
        borderRadius: 3,
        backgroundColor: '#000',
        width: '90%',
        maxWidth: '100%',
        mx: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Typography
        variant="h6"
        sx={{
          mb: 3,
          color: '#fff',
          fontWeight: 'bold',
          textAlign: 'center',
        }}
      >
        Your Night Plan ({plan.length}/3 venues)
      </Typography>
  
      {/* Scrollable container wrapper */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          overflowX: 'auto',
          width: '100%',
          pb: 1,
        }}
      >
        {/* Inner horizontal list that adapts width to content */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            overflowX: 'auto',
            justifyContent: plan.length < 3 ? 'center' : 'flex-start',
            gap: 3,
            px: 1,
            scrollSnapType: 'x mandatory',
          }}
        >
          {plan.map((venue) => (
            <Box
              key={venue.id}
              sx={{
                scrollSnapAlign: 'start',
                minWidth: 280,
                flex: '0 0 auto',
              }}
            >
              <VenueCard venue={venue} />
            </Box>
          ))}
        </Box>
      </Box>
  
      <Box
        sx={{
          textAlign: 'center',
          mt: 4,
        }}
      >
        <Button
          variant="contained"
          onClick={() => navigate('/map')}
          sx={{
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#000',
            fontWeight: 'bold',
            borderRadius: '8px',
            px: 4,
            py: 1.2,
            mt: 1,
            fontSize: '1rem',
            '&:hover': {
              background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
            },
          }}
        >
          View on Map
        </Button>
      </Box>
    </Box>
  );  
}
