import { AppBar, Toolbar, Typography, Button, Box, IconButton, Drawer, List, ListItem, ListItemText } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import logo from '../assets/urban-gala-logo.svg';

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Map', to: '/map' },
  { label: 'Recommendations', to: '/recommendations' },
  { label: 'Venue Details', to: '/venuedetail' },
  { label: 'About', to: '/about' },
];

export default function NavBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <AppBar
        position="sticky"
        sx={{
          backgroundColor: '#121212',
          boxShadow: 'none',
          width: '100%',
          overflowX: 'clip',
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
          {/* Logo + Title */}
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

          {/* Desktop Links */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              gap: { md: 2, lg: 3 },
              flexWrap: 'wrap',
            }}
          >
            {navItems.map((item) => (
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

          {/* Mobile Menu Button */}
          <IconButton
            edge="end"
            onClick={() => setDrawerOpen(true)}
            sx={{ display: { xs: 'flex', md: 'none' } }}
          >
            <MenuIcon sx={{ color: '#D4AF37' }} />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Drawer Menu for Mobile */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            fontWeight: 'bold',
            textTransform: 'uppercase',
            fontSize: '0.9rem',
            letterSpacing: 1,
            color: '#D4AF37',
          },
        }}
      >
        <List>
          {navItems.map((item) => (
            <ListItem
              button
              key={item.to}
              component={Link}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
            >
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}
              />
            </ListItem>
          ))}
        </List>
      </Drawer>
    </>
  );
}
