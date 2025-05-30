import PageWrapper from '../components/PageWrapper';
import { Typography } from '@mui/material';

export default function VenueDetail() {
  return (
    <PageWrapper>
      <Typography variant="h4" gutterBottom>
        Venue Details Page
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page will show details of selected venues.
      </Typography>
    </PageWrapper>
  );
}
