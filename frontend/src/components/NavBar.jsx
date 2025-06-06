import { AppBar, Toolbar, Typography, Button, Box, IconButton, Drawer, List, ListItem, ListItemText } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import logo from '../assets/urban-gala-logo.svg';

// Navigation items
const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Find Your Vibe', to: '/vibe' },
  { label: 'What’s Hot', to: '/recommendations' },
  { label: 'Map View', to: '/map' },
  { label: 'About', to: '/about' },
];

// Main nav bar component
export default function NavBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* === Top App Bar === */}
      <AppBar
        position="sticky"
        sx={{
          backgroundColor: '#000000',
          boxShadow: 'none',
          width: '100%',
          zIndex: 1100, // makes sure nav bar stays on top
        }}
      >
        <Toolbar
          sx={{
            justifyContent: 'space-between', // space between logo and nav links
            width: '100%',
            maxWidth: '1200px',
            mx: 'auto',
            height: 110,
            px: { xs: 2, sm: 4 },
            boxSizing: 'border-box',
          }}
        >
          {/* Logo + Title */}
          <Box
            component={Link}
            to="/"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              textDecoration: 'none', // remove underline from the Link
            }}
          >
            <img src={logo} alt="Urban Gala logo" style={{ height: 76 }} />

            <Box sx={{ lineHeight: 1, mt: 0.5  }}>
              {/* Title */}
              <Typography
                variant="h6"
                sx={{
                  textTransform: 'uppercase',
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mt: 0.5,
                  lineHeight: 1,
                }}
              >
                The Urban Gala
              </Typography>

              {/* Slogan */}
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Navigate the Big Apple - One Gala At A Time
              </Typography>
            </Box>
          </Box>


          {/* Desktop Navigation Links */}
          <Box
            sx={{
              display: { xs: 'none',md: 'flex' }, // nav links hidden on mobile
              gap: { md: 2.5, lg: 3.5 },
              flexWrap: 'wrap',
            }}
          >
            {navItems.map((item) => (
              <Button
              key={item.to}
              component={Link}
              to={item.to}
              sx={{
                position: 'relative',
                fontWeight: 'bold',
                letterSpacing: 1,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                color: '#FFFFFF',
                px: 1,
                
                // hover underline animation
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  bottom: -4,
                  left: 0,
                  height: '2px',
                  width: '0%',
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  transition: 'width 0.3s ease',
                },
                '&:hover::after': {
                  width: '100%',
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>

          {/* Mobile Menu Button */}
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              edge="end"
              onClick={() => setDrawerOpen(true)}
              sx={{
                display: { xs: 'flex', lg: 'none' },
                color: '#3ABEFF', // or '#fff'
                backgroundColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'transparent',
                },
                '&:focus': {
                  outline: 'none',
                },
                padding: 1,
              }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer Menu for Mobile */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: '#121212',
            color: '#D4AF37',
            width: '250px',
            px: 2,
            pt: 4,
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
              sx={{
                py: 1.5,
                borderBottom: '1px solid #333',
              }}
            >
              {/* Nav items */}
              <Typography
                component="span"
                sx={{
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  fontSize: '0.9rem',
                  letterSpacing: 1,
                  width: '100%',
                  position: 'relative',
                  '&::after': {
                  content: '""',
                  position: 'absolute',
                  bottom: -4,
                  left: 0,
                  height: '2px',
                  width: '0%',
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  transition: 'width 0.3s ease',
                  },
                  '&:hover::after': {
                    width: '100%',
                  },
                }}
              >
                {item.label}
              </Typography>

            </ListItem>
          ))}
        </List>
      </Drawer>
    </>
  );
}
