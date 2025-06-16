import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Grid,
  Divider
} from '@mui/material';

export default function Profile() {
  const { user, updateProfile, logout, loading } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phoneNumber: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        username: user.username || '',
        phoneNumber: user.phoneNumber || '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      });
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear messages when user starts typing
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validateForm = () => {
    // Basic validation
    if (!formData.firstName.trim()) {
      return 'First name is required';
    }
    if (!formData.lastName.trim()) {
      return 'Last name is required';
    }
    if (!formData.email.trim()) {
      return 'Email is required';
    }
    if (!formData.username.trim()) {
      return 'Username is required';
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return 'Please enter a valid email address';
    }

    // Password validation (only if changing password)
    if (formData.newPassword) {
      if (!formData.currentPassword) {
        return 'Current password is required to change password';
      }
      if (formData.newPassword.length < 6) {
        return 'New password must be at least 6 characters';
      }
      if (formData.newPassword !== formData.confirmNewPassword) {
        return 'New passwords do not match';
      }
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate form
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setUpdating(true);

    try {
      // Prepare update data
      const updateData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
        phoneNumber: formData.phoneNumber.trim() || null
      };

      // Add password fields only if changing password
      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }

      await updateProfile(user.id, updateData);
      
      // Clear password fields after successful update
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: ''
      }));

      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="md">
      <Paper elevation={4} sx={{ mt: 4, p: 4, borderRadius: 2 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Profile Settings
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          {/* Personal Information Section */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            Personal Information
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="First Name"
                name="firstName"
                required
                fullWidth
                value={formData.firstName}
                onChange={handleChange}
                disabled={updating}
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
                disabled={updating}
              />
            </Grid>
          </Grid>

          <TextField
            label="Phone Number"
            name="phoneNumber"
            type="tel"
            fullWidth
            value={formData.phoneNumber}
            onChange={handleChange}
            disabled={updating}
            sx={{ mb: 3 }}
          />

          <Divider sx={{ my: 3 }} />

          {/* Account Information Section */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            Account Information
          </Typography>

          <TextField
            label="Username"
            name="username"
            required
            fullWidth
            value={formData.username}
            onChange={handleChange}
            disabled={updating}
            sx={{ mb: 2 }}
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            required
            fullWidth
            value={formData.email}
            onChange={handleChange}
            disabled={updating}
            sx={{ mb: 3 }}
          />

          <Divider sx={{ my: 3 }} />

          {/* Password Change Section */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            Change Password (Optional)
          </Typography>

          <TextField
            label="Current Password"
            name="currentPassword"
            type="password"
            fullWidth
            value={formData.currentPassword}
            onChange={handleChange}
            disabled={updating}
            sx={{ mb: 2 }}
            helperText="Required only if changing password"
          />

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="New Password"
                name="newPassword"
                type="password"
                fullWidth
                value={formData.newPassword}
                onChange={handleChange}
                disabled={updating}
                helperText="Must be at least 6 characters"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Confirm New Password"
                name="confirmNewPassword"
                type="password"
                fullWidth
                value={formData.confirmNewPassword}
                onChange={handleChange}
                disabled={updating}
              />
            </Grid>
          </Grid>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', mt: 4 }}>
            <Button
              variant="outlined"
              color="error"
              onClick={logout}
              disabled={updating}
            >
              Logout
            </Button>

            <Button
              type="submit"
              variant="contained"
              disabled={updating}
              sx={{
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
              {updating ? <CircularProgress size={24} /> : 'Update Profile'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}