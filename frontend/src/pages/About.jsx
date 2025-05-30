import PageWrapper from '../components/PageWrapper';
import { Typography } from '@mui/material';

export default function About() {
  return (
    <PageWrapper>
      <Typography variant="h4" gutterBottom>
        About The Urban Gala
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Coming soon...
      </Typography>
    </PageWrapper>
  );
}

