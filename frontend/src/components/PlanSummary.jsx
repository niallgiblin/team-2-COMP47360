// components/PlanSummary.jsx
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import VenueCard from './VenueCard';

export default function PlanSummary() {
  const { plan } = usePlan();
  const navigate = useNavigate();
  const { user } = useAuth();

  // user's name, fallback to "My Plan" if null
  const planTitle = user?.firstName
  ? `Plan for ${user.firstName}`
  : 'My Plan';

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
      {/* Responsive heading + View Map button */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'center', md: 'center' },
          mb: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            color: '#fff',
            fontWeight: 'bold',
            textAlign: { xs: 'center', md: 'left' },
          }}
        >
          {planTitle}
        </Typography>

        <Button
          variant="contained"
          onClick={() =>
            navigate('/map', { state: { fromPlan: true } })
          }          
          sx={{
            mt: { xs: 1, md: 0 },
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#000',
            fontWeight: 'bold',
            borderRadius: '8px',
            px: 3,
            py: 1,
            fontSize: '0.9rem',
            '&:hover': {
              background: 'linear-gradient(to right, #FF4ECD, #3ABEFF)',
            },
          }}
        >
          View On Map
        </Button>
      </Box>

      {/* Subheading */}
      <Typography
        variant="body2"
        sx={{
          mb: 2,
          color: '#aaa',
          textAlign: { xs: 'center', md: 'left' },
        }}
      >
        {plan.length} of 3 spots added
      </Typography>

  
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {plan.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </Box>

    </Box>
  );  
}
