import { Box, Typography, Button, Container } from '@mui/material';
import skyline from '../assets/skyline.svg';
import PageWrapper from '../components/PageWrapper';
import FeatureCard from '../components/FeatureCard';


export default function Home() {
  return (
    <>
      {/* Hero section */}
      <Box
        sx={{
          width: '100vw',
          backgroundColor: '#414141',
          color: '#FFFFFF',
          textAlign: 'center',
          pt: 6,
          pb: {xs: 15, sm: 20, md: 30},
          position: 'relative',
          overflow: 'hidden',
        }}
      >
         {/* Hero text content */} 
        <Box sx={{ maxWidth: '800px', mx: 'auto', px: 2, zIndex: 1, position: 'relative' }}>
          <Typography 
            variant="h3"
            gutterBottom
            sx={{
              fontWeight: 'bold',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 2,
            }} 
            >
            Find your vibe in NYC Nights
          </Typography>

          {/* Subheading with soft blue */}
          <Typography 
            variant="h6" 
            sx={{
              color: '#AEEBFF',
              maxWidth: '600px',
              mx: 'auto',
              mb: 5,
            }}
            >
            Cozy bar? Rooftop club? Wild night out? We'll get you there!
          </Typography>

          {/* CTA button */}
          <Button
            variant="contained"
            sx={{
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#121212',
              fontWeight: 'bold',
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              '&:hover': {
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
              },
            }}
          >
            Find My Venue
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
              title="Find Your Vibe"
              description="Describe your night - we'll math you with the perfect spot."
            />
            <FeatureCard
              title="What's Hot"
              description="Track the buzz and see where the night's heating up."
            />
            <FeatureCard
              title="Map View"
              description="Tap the map to explore venues, check vibes and plan your route."
            />
          </Box>
        </Container>
      </PageWrapper>
    </>
  );
}
