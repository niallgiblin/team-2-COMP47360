import React, { useState, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import nycVideo from '../assets/hero.mp4';
import { Link } from 'react-router-dom';


// Define and export the HeroSection component
export default function HeroSection() {
  // Local state to control whether the video background should be shown
  const [shouldShowVideo, setShouldShowVideo] = useState(false);

  // Run once on component mount to check screen size and connection speed
  useEffect(() => {
    const isDesktop = window.innerWidth >= 768; // avoid loading the video on small screens, to save on mobile bandwidth
    const isFastConnection =
      navigator.connection?.effectiveType === '4g' || !navigator.connection;

    if (isDesktop && isFastConnection) {
      setShouldShowVideo(true);
    }
  }, []);

  return (
    // Outer container for the entire hero section
    <Box
      sx={{
        width: '100vw', // Full viewport width
        height: {xs: '50vw', sm: '30vw', md: '10vw'},
        backgroundColor: '#414141', // fallback background if video doesn't load
        color: '#FFFFFF', // default text colour
        textAlign: 'center', // centre all text
        pt: 6, // padding above content
        pb: { xs: 15, sm: 20, md: 30 }, // responsive bottom padding
        position: 'relative',
        overflow: 'hidden', // hides anything that spills outside the box
      }}
    >
      {/* Conditionally render video background behind content */}
      {shouldShowVideo && (
        <Box
          component="video" // lets you style and position a video using MUI, but renders the correct HTML tag, for browsers to play it 
          autoPlay // automatically starts playing the video when it loads
          muted //mutes the video
          loop
          playsInline
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover', // Ensures video covers area fully
            objectPosition: 'top', // video stays anchored to top, only bottom is cropped
            zIndex: 0,
          }}
        >
          <source src={nycVideo} type="video/mp4" />
        </Box>
      )}

      {/* Container for hero text and CTA button */}
      <Box
        sx={{
          maxWidth: '800px', // limit text width for readability
          mx: 'auto', // horizontally centre the box
          px: 2, // horizontal padding
          zIndex: 1, // Ensure this content appears above the video
          position: 'relative',
          backgroundColor: 'rgba(0, 0, 0, 0.2)', // semi-transparent black
          borderRadius: 2,
          p: 4,
          boxShadow: 3,
        }}
      >
        {/* Main headline with gradient text */}
        <Typography
          variant="h3"
          gutterBottom //adds margin below the text
          sx={{
            fontWeight: 'bold',
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text', // clips the gradient to text shape
            WebkitTextFillColor: 'transparent', // makes the text colour transparent, so the gradient shows
            mb: 2, // margin bottom
          }}
        >
          Find your vibe in NYC Nights
        </Typography>

        {/* Subheading text */}
        <Typography
          variant="h6"
          sx={{
            color: '#AEEBFF', // light blue clour
            maxWidth: '600px', // keep subheading narrow
            mx: 'auto', // centre horizontally
            mb: 5, // margin between heading and CTA button
          }}
        >
          Cozy bar? Rooftop club? Wild night out? We'll get you there!
        </Typography>

        {/* Call-to-action button */}
        <Button
          component={Link}
          to="/vibe"
          variant="contained"
          sx={{
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)', //background colour
            color: '#121212', // text colour
            fontWeight: 'bold',
            px: 4, // horizontal padding inside the button
            py: 1.5, // vertical padding
            fontSize: '1rem',
            borderRadius: '8px', // rounded corners
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', //soft shadow
            '&:hover': {
              background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)', //brighter gradient on hover
            },
          }}
        >
          Find My Venue
        </Button>
      </Box>
    </Box>
  );
}
