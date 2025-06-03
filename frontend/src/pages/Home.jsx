import { Box, Typography, Button, Container } from '@mui/material';
import PageWrapper from '../components/PageWrapper';
import FeatureCard from '../components/FeatureCard';
import HeroSection from '../components/HeroSection';
import searchIcon from '../assets/search.svg';
import hotIcon from '../assets/fire.svg';
import exploreIcon from '../assets/map.svg';


export default function Home() {
  return (
    <>
      {/* Hero section */}
      <HeroSection />

      {/* Main content area */}
      <PageWrapper>
      <Container sx={{ pt: 2, pb: 8, mt: -8 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: { xs: 3, md: 6 },
            px: 2,
            py: { xs: 4, md: 6 },
            backgroundColor: '#000',
          }}
        >
          <FeatureCard
            iconSrc={searchIcon}
            title="Find Your Vibe"
            description="Describe your night – we'll match you with the perfect spot."
          />
          <FeatureCard
            iconSrc={hotIcon}
            title="What's Hot"
            description="Track the buzz and see where the night's heating up."
          />
          <FeatureCard
            iconSrc={exploreIcon}
            title="Map View"
            description="Tap the map to explore venues, check vibes and plan your route."
          />
        </Box>
      </Container>

      </PageWrapper>
    </>
  );
}
