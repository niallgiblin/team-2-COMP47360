// Component to display a saved plan, other plan summaries display plan from context
import { Box, Typography } from '@mui/material';
import VenueCard from './VenueCard';

export default function PlanDisplay({ planName, venues }) {
  return (
    <Box
      sx={{
        p: 2,
        backgroundColor: '#000',
      }}
    >
      <Typography 
        variant="subtitle1" 
        sx={{ 
            fontWeight: 'bold', 
            color: '#fff', 
        }}
    >
        {planName}
      </Typography>

      <Box 
        sx={{ 
            display: 'flex', 
            overflowX: 'auto', 
            gap: 2 
        }}
        >
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} variant="compact" />
        ))}
      </Box>
    </Box>
  );
}
