import { Box, Typography } from '@mui/material';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import VenueCard from './VenueCard';

export default function CompactPlanSummary() {
  const { plan } = usePlan();
  const { user } = useAuth();

  const planTitle = user?.firstName
    ? `Plan for ${user.firstName}`
    : 'Your Plan';

  if (plan.length === 0) return null;

  return (
    <Box sx={{ px: 2, pt: 2 }}>
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

      {/* Venue cards (horizontal scroll) */}
      <Box
        sx={{
          display: 'flex',
          overflowX: 'auto',
          gap: 2,
          pb: 1,
        }}
      >
        {plan.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="compact" />
        ))}
      </Box>
    </Box>
  );
}
