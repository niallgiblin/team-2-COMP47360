import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress
} from '@mui/material';

export default function Login() {
  const { login, loading } = useAuth();
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!formData.usernameOrEmail.trim()) {
      setError('Please enter your username or email');
      return;
    }
    
    if (!formData.password) {
      setError('Please enter your password');
      return;
    }

    try {
      await login(formData.usernameOrEmail.trim(), formData.password);
    } catch (err) {
      setError(err.message || 'Invalid login credentials');
    }
  };

  return (
    // centre login form in container
    <Container maxWidth="sm">
      <Paper 
        elevation={4}            // shadow effect
        sx={{ 
            mt: 8,              // top margin
            p: 4,               // padding
            borderRadius: 2     // rounded corners
        }}
    >
        {/* heading text*/}
        <Typography 
            variant="h4" 
            align="center" 
            gutterBottom
        >
          Log In
        </Typography>

        {/* show error message if login fails*/}
        {error && (
          <Typography 
            color="error" 
            align="center" 
            sx={{ 
                mb: 2 
            }}
            >
            {error}
          </Typography>
        )}

        <Box 
            component="form" 
            onSubmit={handleSubmit} 
            sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 3 
            }}
        >

        {/* email input */}
          <TextField
            label="Email"
            type="email"
            required
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* password input */}
          <TextField
            label="Password"
            type="password"
            required
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* submit button */}
          <Button
            type="submit"
            variant="contained"
            size="large"
            sx={{
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              fontWeight: 'bold',
              color: '#121212',
              '&:hover': {
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
              }
            }}
          >
            Log In
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}

