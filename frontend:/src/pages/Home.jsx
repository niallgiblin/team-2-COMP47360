import { Box, Typography, Button, Container } from '@mui/material';
import skyline from '../assets/skyline.svg';
import PageWrapper from '../components/PageWrapper';
import FeatureCard from '../components/FeatureCard';


export default function Home() {
  return (
    <>
      {/* Full-width hero section */}
      <Box
        sx={{
          width: '100vw',
          backgroundColor: '#414141',
          color: '#FFFFFF',
          textAlign: 'center',
          pt: 6,
          pb: 30,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ maxWidth: '800px', mx: 'auto', px: 2, zIndex: 1, position: 'relative' }}>
          <Typography variant="h3" fontWeight="bold" gutterBottom>
            Turn Data into Standing Ovations
          </Typography>

          <Typography variant="h6" color="#CCCCCC" maxWidth="600px" mx="auto" mb={5}>
            From quiet nights to city surges, our AI-powered forecasts help you make smarter
            decisions around staffing, stock, and showtimes.
          </Typography>

          <Button
            variant="contained"
            sx={{
              backgroundColor: '#D4AF37',
              color: '#1A1A1A',
              fontWeight: 'bold',
              px: 4,
              py: 1.5,
              '&:hover': {
                backgroundColor: '#C19A35',
              },
            }}
          >
            View the Map
          </Button>
        </Box>

        {/* Skyline image */}
        <Box
          component="img"
          src={skyline}
          alt="NYC skyline"
          sx={{
            width: '100%',
            position: 'absolute',
            bottom: 0,
            left: 0,
            zIndex: 0,
          }}
        />
      </Box>

      {/* Main content area */}
      <PageWrapper>
        <Container sx={{ pt: 4, pb: 8, mt: -8 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <FeatureCard
              title="Smart Planning"
              description="Choose the optimal time for your event, using real-time crowd forecasts."
            />
            <FeatureCard
              title="Personalised Predictions"
              description="Forecast attendance for theatres, galleries, gigs. Be ready for every crowd."
            />
            <FeatureCard
              title="Discover Hidden Gems"
              description="Personalised suggestions beyond the big-name venues."
            />
          </Box>
        </Container>
      </PageWrapper>
    </>
  );
}
