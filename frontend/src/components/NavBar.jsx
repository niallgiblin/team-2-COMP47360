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

// Navigation items
const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Find Your Vibe', to: '/vibe' },
  { label: 'What’s Hot', to: '/recommendations' },
  { label: 'Map View', to: '/map' },
  { label: 'About', to: '/about' },
];

// main NavBar component
export default function NavBar() {
  const [drawerOpen, setDrawerOpen] = useState(false);  // tracks mobile menu state
  const { isAuthenticated, user, logout } = useAuth();  // auth state from context

  return (
    <>
      {/* Top App Bar */}
      <AppBar
        position="sticky"
        sx={{
          backgroundColor: '#000000',
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
              textDecoration: 'none',
            }}
          >
            <img src={logo} alt="Urban Gala logo" style={{ height: 76 }} />
            
            <Box sx={{ lineHeight: 1, mt: 0.5 }}>
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
              display: { xs: 'none', md: 'flex' },
              gap: { md: 2.5, lg: 3.5 },
              flexWrap: 'wrap',
              alignItems: 'center',
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

            {/* show user and logout buttons if logged in */}
            {isAuthenticated ? (
              <>
                <Typography sx={{ color: '#fff', ml: 2 }}>
                  Welcome, {user?.name || 'User'}
                </Typography>
                <Button
                  onClick={logout}
                  sx={{
                    ml: 2,
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
              </>
            ) : (
              <>
                {/* Log In / Sign Up buttons */}
                <Button
                  component={Link}
                  to="/login"
                  sx={{
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    color: '#FFFFFF',
                    border: '1px solid #FF4ECD',
                    px: 2,
                    ml: 2,
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
                    ml: 1,
                    '&:hover': {
                      background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                      color: '#000',
                    },
                  }}
                >
                  Sign Up
                </Button>
              </>
            )}
          </Box>

          {/* Mobile Menu Button */}
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              edge="end"
              onClick={() => setDrawerOpen(true)}
              sx={{
                color: '#3ABEFF',
                backgroundColor: 'transparent',
                '&:hover': { backgroundColor: 'transparent' },
                '&:focus': { outline: 'none' },
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
          {/* Always show navigation items */}
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

          {/* Auth-based drawer buttons */}
          {isAuthenticated ? (
            <>
              <ListItem sx={{ py: 2 }}>
                <Typography
                  variant="body1"
                  sx={{
                    color: '#fff',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Welcome, {user?.name || 'User'}
                </Typography>
              </ListItem>

              {/* Log in / sign up buttons for mobile */}
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
                  Log Out
                </Typography>
              </ListItem>
            </>
          ) : (
            <>
              <ListItem
                button
                component={Link}
                to="/login"
                onClick={() => setDrawerOpen(false)}
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
                  Log In
                </Typography>
              </ListItem>

              <ListItem
                button
                component={Link}
                to="/signup"
                onClick={() => setDrawerOpen(false)}
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
