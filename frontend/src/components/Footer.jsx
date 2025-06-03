import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import logo from '../assets/urban-gala-logo.svg';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: '#000000',
        color: '#FFFFFF',
        py: 4,
        px: 2,
        mt: 8,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
      }}
    >
      {/* Logo + Name */}
      <Box
        component={Link}
        to="/"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          textDecoration: 'none',
          mb: 1,
        }}
      >
        <img src={logo} alt="Urban Gala logo" style={{ height: 40 }} />
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
      <Typography variant="caption" sx={{ color: '#888', mt: 1 }}>
        © 2025 The Urban Gala. All rights reserved.
      </Typography>
    </Box>
  );
}
