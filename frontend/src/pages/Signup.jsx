import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Grid
} from '@mui/material';

export default function Signup() {
  const { signup, loading } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phoneNumber: ''
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

  const validateForm = () => {
    // Username validation
    if (!formData.username.trim()) {
      return 'Username is required';
    }
    if (formData.username.length < 3) {
      return 'Username must be at least 3 characters';
    }

    // Email validation
    if (!formData.email.trim()) {
      return 'Email is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return 'Please enter a valid email address';
    }

    // Password validation
    if (!formData.password) {
      return 'Password is required';
    }
    if (formData.password.length < 6) {
      return 'Password must be at least 6 characters';
    }

    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    // Name validation
    if (!formData.firstName.trim()) {
      return 'First name is required';
    }
    if (!formData.lastName.trim()) {
      return 'Last name is required';
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate form
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      // Prepare data for backend (matching SignUpRequest format)
      const userData = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phoneNumber: formData.phoneNumber.trim() || null
      };

      await signup(userData);
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    }
  };

  return (
    <Container maxWidth="md">
      <Paper elevation={4} sx={{ mt: 4, p: 4, borderRadius: 2 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Create an Account
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          {/* Personal Information */}
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Personal Information
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="First Name"
                name="firstName"
                required
                fullWidth
                value={formData.firstName}
                onChange={handleChange}
                disabled={loading}
                placeholder="Enter your first name"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Last Name"
                name="lastName"
                required
                fullWidth
                value={formData.lastName}
                onChange={handleChange}
                disabled={loading}
                placeholder="Enter your last name"
              />
            </Grid>
          </Grid>

          <TextField
            label="Phone Number (Optional)"
            name="phoneNumber"
            type="tel"
            fullWidth
            value={formData.phoneNumber}
            onChange={handleChange}
            disabled={loading}
            placeholder="Enter your phone number"
          />

          {/* Account Information */}
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Account Information
          </Typography>

          <TextField
            label="Username"
            name="username"
            required
            fullWidth
            value={formData.username}
            onChange={handleChange}
            disabled={loading}
            placeholder="Choose a unique username"
            helperText="Must be at least 3 characters"
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            required
            fullWidth
            value={formData.email}
            onChange={handleChange}
            disabled={loading}
            placeholder="Enter your email address"
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            required
            fullWidth
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
            placeholder="Create a strong password"
            helperText="Must be at least 6 characters"
          />

          <TextField
            label="Confirm Password"
            name="confirmPassword"
            type="password"
            required
            fullWidth
            value={formData.confirmPassword}
            onChange={handleChange}
            disabled={loading}
            placeholder="Confirm your password"
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
            sx={{
              mt: 2,
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              fontWeight: 'bold',
              color: '#121212',
              '&:hover': {
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)'
              },
              '&:disabled': {
                background: '#ccc',
              }
            }}
          >
            {loading ? <CircularProgress size={24} /> : 'Create Account'}
          </Button>

          <Typography align="center" sx={{ mt: 2 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#3ABEFF', textDecoration: 'none' }}>
              Log in here
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
