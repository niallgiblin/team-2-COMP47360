import { Box, Typography, Button, Container } from '@mui/material';
import skyline from '../assets/skyline.svg';
import PageWrapper from '../components/PageWrapper';
import FeatureCard from '../components/FeatureCard';
import HeroSection from '../components/HeroSection';


export default function Home() {
  return (
    <>
      {/* Hero section */}
      <HeroSection />

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
