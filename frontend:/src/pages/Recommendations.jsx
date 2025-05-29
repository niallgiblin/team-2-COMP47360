import PageWrapper from '../components/PageWrapper';
import { Typography } from '@mui/material';

export default function Recommendations() {
  return (
    <PageWrapper>
      <Typography variant="h4" gutterBottom>
        Recommendations Page
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page will show venue suggestions based on predicted busyness.
      </Typography>
    </PageWrapper>
  );
}
