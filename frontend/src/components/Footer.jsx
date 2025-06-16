import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import logo from '../assets/urban-gala-logo.svg';

export default function Footer() {
  return (
    
    // outer footer container
    <Box
      component="footer"
      sx={{
        backgroundColor: '#000000', // solid black background
        color: '#FFFFFF',           // default text colour
        py: 4,                      // vertical padding
        px: 2,                      // horizontal padding
        mt: 8,                      // top margin
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      {/* Logo + Name */}
      <Box
        component={Link}    // turn box into clickable link
        to="/"              // link target (homepage)
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,                 // space between logo and text
          textDecoration: 'none',   // remove underline
          mb: 1,                    // margin below
        }}
      >
        
        {/* logo image */}
        <img src={logo} alt="Urban Gala logo" style={{ height: 40 }} />
        
        {/* Name */}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 'bold',
            letterSpacing: 1,
            textTransform: 'uppercase',
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          The Urban Gala
        </Typography>
      </Box>

      {/* Copyright */}
      <Typography variant="caption" 
        sx={{ 
          color: '#888', 
          mt: 1 
        }}
      >
        © 2025 The Urban Gala. All rights reserved.
      </Typography>
    </Box>
  );
}
