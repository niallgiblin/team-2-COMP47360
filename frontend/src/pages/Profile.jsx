import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Avatar,
  Box,
  TextField,
  Button,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Grid,
  Divider,
  Chip
} from '@mui/material';
import { deepPurple } from '@mui/material/colors';
import PersonIcon from '@mui/icons-material/Person';

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
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

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
      if (user.profileImage) setPreview(user.profileImage);
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
    if (success) setSuccess('');
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setPreview(imageUrl);
      // Optional: upload logic
    }
  };

  const validateForm = () => {
    if (!formData.firstName.trim()) return 'First name is required';
    if (!formData.lastName.trim()) return 'Last name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!formData.username.trim()) return 'Username is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Please enter a valid email address';

    if (formData.newPassword) {
      if (!formData.currentPassword) return 'Current password is required to change password';
      if (formData.newPassword.length < 6) return 'New password must be at least 6 characters';
      if (formData.newPassword !== formData.confirmNewPassword) return 'New passwords do not match';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setUpdating(true);

    try {
      const updateData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
        phoneNumber: formData.phoneNumber.trim() || null
        // Add profileImage upload if needed
      };

      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }

      await updateProfile(user.id, updateData);

      setFormData((prev) => ({
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
        <Paper elevation={4} sx={{ mt: 4, p: 4, borderRadius: 3 }}>
          <Box display="flex" alignItems="center" flexDirection="column" mb={3}>
            <Avatar
                src={preview}
                sx={{ width: 100, height: 100, mb: 2, bgcolor: deepPurple[500] }}
            >
              {!preview && <PersonIcon fontSize="large" />}
            </Avatar>
            <input
                type="file"
                accept="image/*"
                hidden
                ref={fileInputRef}
                onChange={handleImageChange}
            />
            <Button onClick={() => fileInputRef.current.click()} size="small" variant="outlined">
              Upload Photo
            </Button>

            <Typography variant="h5" fontWeight="bold" sx={{ mt: 2 }}>
              {formData.firstName} {formData.lastName}
            </Typography>

            <Chip label={`@${formData.username}`} size="small" sx={{ mt: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {formData.email}
            </Typography>
            <Typography variant="caption" sx={{ mt: 0.5 }}>
              Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'N/A'}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ my: 2 }}>{success}</Alert>}

          <Box component="form" onSubmit={handleSubmit} mt={3}>
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
                value={formData.phoneNumber}
                onChange={handleChange}
                disabled={updating}
                sx={{ mb: 3 }}

            />

            <Divider sx={{ my: 3 }} />

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
                    helperText="Minimum 6 characters"
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

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
              <Button variant="outlined" color="error" onClick={logout} disabled={updating}>
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