import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link } from 'react-router-dom';
import logo from '../assets/urban-gala-logo.svg';

export default function NavBar() {
  return (
    <AppBar
      position="sticky"
      sx={{
        backgroundColor: '#121212',
        boxShadow: 'none',
        width: '100%',
        zIndex: 1100,
      }}
    >
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '1200px',
          mx: 'auto',
          height: 110,
          px: 4,
        }}
      >
        {/* Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <img src={logo} alt="Urban Gala logo" style={{ height: 60 }} />
          <Box sx={{ lineHeight: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                color: '#D4AF37',
                textTransform: 'uppercase',
                letterSpacing: 1,
                lineHeight: 1.2,
              }}
            >
              The Urban Gala
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: '#D4AF37',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Navigate the Big Apple – One Gala at a Time
            </Typography>
          </Box>
        </Box>

        {/* Navigation Links */}
        <Box sx={{ display: 'flex', gap: 3 }}>
          {[
            { label: 'Home', to: '/' },
            { label: 'Map', to: '/map' },
            { label: 'Recommendations', to: '/recommendations' },
            { label: 'Venue Details', to: '/venuedetail' },
            { label: 'About', to: '/about' },
          ].map((item) => (
            <Button
              key={item.to}
              color="inherit"
              component={Link}
              to={item.to}
              sx={{
                fontWeight: 'bold',
                letterSpacing: 1,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                '&:hover': {
                  color: '#D4AF37',
                },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
