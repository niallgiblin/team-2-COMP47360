import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Drawer,
  List,
  ListItem
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import logo from '../assets/urban-gala-logo.svg';
import { useAuth } from '../context/AuthContext';

// Navigation items used in both desktop and mobile menus
const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Find Your Vibe', to: '/vibe' },
  { label: 'What’s Hot', to: '/recommendations' },
  { label: 'Map View', to: '/map' },
  { label: 'About', to: '/about' },
];

export default function NavBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <>
      {/* Top black navigation bar */}
      <AppBar
        position="sticky"
        sx={{
          backgroundColor: '#000000',
          boxShadow: 'none',
          width: '100%',
          zIndex: 1100,
        }}
      >
        {/* Toolbar with internal container for layout */}
        <Toolbar
          sx={{
            width: '100%',
            px: { xs: 2, sm: 4 },
            height: 110,
            boxSizing: 'border-box',
            backgroundColor: 'transparent',
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: { md: '100%', lg: '1200px' },
              mx: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            {/* Logo + title */}
            <Box
              component={Link}
              to="/"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textDecoration: 'none',
              }}
            >
              <img src={logo} alt="Urban Gala logo" style={{ height: 76 }} />
              <Box sx={{ lineHeight: 1, mt: 0.5, whiteSpace: 'nowrap' }}>
                <Typography
                  variant="h6"
                  sx={{
                    textTransform: 'uppercase',
                    background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  The Urban Gala
                </Typography>
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

            {/* Desktop nav links + auth actions (only visible on md+) */}
            <Box
              sx={{
                display: { xs: 'none', md: 'flex' },
                alignItems: 'center',
                gap: 2.5,
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

              {/* Authenticated user: Welcome + Logout */}
              {isAuthenticated ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button
                    component={Link}
                    to="/profile"
                    sx={{
                      position: 'relative',
                      fontWeight: 'bold',
                      letterSpacing: 1,
                      fontSize: '0.9rem',
                      textTransform: 'uppercase',
                      color: '#FFFFFF',
                      px: 1,
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
                    Welcome, {user?.name || 'User'}
                  </Button>
                  <Button
                    onClick={logout}
                    sx={{
                      fontWeight: 'bold',
                      color: '#FFFFFF',
                      border: '1px solid #FF4ECD',
                      px: 2,
                      '&:hover': {
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        color: '#000',
                      },
                    }}
                  >
                    Log Out
                  </Button>
                </Box>
              ) : (
                // Not logged in: Log in + Sign up
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    component={Link}
                    to="/login"
                    sx={{
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      color: '#FFFFFF',
                      border: '1px solid #FF4ECD',
                      px: 2,
                      '&:hover': {
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        color: '#000',
                      },
                    }}
                  >
                    Log In
                  </Button>
                  <Button
                    component={Link}
                    to="/signup"
                    sx={{
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      color: '#FFFFFF',
                      border: '1px solid #FF4ECD',
                      px: 2,
                      '&:hover': {
                        background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                        color: '#000',
                      },
                    }}
                  >
                    Sign Up
                  </Button>
                </Box>
              )}
            </Box>

            {/* Mobile hamburger icon (right-aligned, only visible on xs/sm) */}
            <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
              <IconButton
                edge="end"
                onClick={() => setDrawerOpen(true)}
                sx={{
                  color: '#3ABEFF',
                  '&:hover': { backgroundColor: 'transparent' },
                  padding: 1,
                }}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer for mobile menu */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: '#121212',
            color: '#FFFFFF', // fix: prevent unwanted yellow
            width: '250px',
            px: 2,
            pt: 4,
          },
        }}
      >
        <List>
          {/* Nav links */}
          {navItems.map((item) => (
            <ListItem
              button
              key={item.to}
              component={Link}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
              sx={{ py: 1.5, borderBottom: '1px solid #333' }}
            >
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
                  '&:hover::after': { width: '100%' },
                }}
              >
                {item.label}
              </Typography>
            </ListItem>
          ))}

          {/* Auth area */}
          {isAuthenticated ? (
            <>
              {/* Welcome button (now clickable!) */}
              <ListItem
                button
                component={Link}
                to="/profile"
                onClick={() => setDrawerOpen(false)}
                sx={{
                  py: 1.5,
                  borderBottom: '1px solid #333',
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    fontSize: '0.9rem',
                    letterSpacing: 1,
                    width: '100%',
                    color: '#FFFFFF',
                  }}
                >
                  Welcome, {user?.name || 'User'}
                </Typography>
              </ListItem>

              {/* Log out */}
              <ListItem
                button
                onClick={() => {
                  logout();
                  setDrawerOpen(false);
                }}
                sx={{
                  py: 1.5,
                  borderBottom: '1px solid #333',
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    fontSize: '0.9rem',
                    letterSpacing: 1,
                    width: '100%',
                    color: '#FFFFFF',
                    '&:hover': { color: '#3ABEFF' },
                  }}
                >
                  Log Out
                </Typography>
              </ListItem>
            </>
          ) : (
            <>
              {/* Login */}
              <ListItem
                button
                component={Link}
                to="/login"
                onClick={() => setDrawerOpen(false)}
                sx={{ py: 1.5, borderBottom: '1px solid #333' }}
              >
                <Typography sx={{ ...drawerLinkStyles }}>
                  Log In
                </Typography>
              </ListItem>

              {/* Signup */}
              <ListItem
                button
                component={Link}
                to="/signup"
                onClick={() => setDrawerOpen(false)}
                sx={{ py: 1.5, borderBottom: '1px solid #333' }}
              >
                <Typography sx={{ ...drawerLinkStyles }}>
                  Sign Up
                </Typography>
              </ListItem>
            </>
          )}
        </List>
      </Drawer>
    </>
  );
}

// Reusable style for drawer items
const drawerLinkStyles = {
  fontWeight: 'bold',
  textTransform: 'uppercase',
  fontSize: '0.9rem',
  letterSpacing: 1,
  width: '100%',
  color: '#FFFFFF',
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
};
