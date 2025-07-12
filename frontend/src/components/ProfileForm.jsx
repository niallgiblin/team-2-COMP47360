// React hooks and Material UI components
import { useState, useEffect, useRef } from 'react';
import {
  Avatar,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Grid,
  Divider,
  Chip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '../context/AuthContext'; // custom context for auth/user management

// Main profile form component
export default function ProfileForm() {
  // Access user object and relevant auth functions
  const { user, updateProfile, logout, loading } = useAuth();

  // Main form state – holds all user input and file selection
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phoneNumber: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
    profileImageFile: null, // for uploading profile picture
  });

  // UI states for messages and loading
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState(false);

  // Local avatar preview (used before uploading to backend)
  const [preview, setPreview] = useState(null);

  // Reference to the hidden file input (for triggering click)
  const fileInputRef = useRef(null);

  // Load user data into form when component mounts or user updates
  useEffect(() => {
      if (user) {
        setFormData((prev) => ({
          ...prev,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          username: user.username || '',
          phoneNumber: user.phoneNumber || '',
        }));

        // if image exists, use it for avatar 
        if (user.profileImage) setPreview(user.profileImage);
      }
    }, [user]);

    // handle all text input changes
    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
      setError('');
      setSuccess('');
    };

    // handle image file selection and preview
    const handleImageChange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const imageUrl = URL.createObjectURL(file);
        setPreview(imageUrl);
        setFormData((prev) => ({
          ...prev,
          profileImageFile: file,
        }));
      }
    };

  // Validate the form fields before submission
  const validateForm = () => {
    if (!formData.firstName.trim()) return 'First name is required';
    if (!formData.lastName.trim()) return 'Last name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!formData.username.trim()) return 'Username is required';

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Please enter a valid email address';

    // Password rules (if updating)
    if (formData.newPassword) {
      if (!formData.currentPassword) return 'Current password is required to change password';
      if (formData.newPassword.length < 6) return 'New password must be at least 6 characters';
      if (formData.newPassword !== formData.confirmNewPassword) return 'New passwords do not match';
    }

    return null;
  };

  // Submit updated profile info
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
      // Current implementation using plain object (no image upload yet)
      const updateData = new FormData();
      updateData.append('firstName', formData.firstName.trim());
      updateData.append('lastName', formData.lastName.trim());
      updateData.append('email', formData.email.trim());
      updateData.append('username', formData.username.trim());
      updateData.append('phoneNumber', formData.phoneNumber.trim());

      if (formData.profileImageFile) {
        updateData.append('profileImage', formData.profileImageFile);
      }

      if (formData.newPassword) {
        updateData.append('currentPassword', formData.currentPassword);
        updateData.append('newPassword', formData.newPassword);
      }

      // call auth context update function
      await updateProfile(user.id, updateData);


      // Reset password fields after update
      setFormData((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      }));

      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  // Loading spinner While loading user data
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 3 },
        pb: 4,
        color: '#FFFFFF',
      }}
    >
      {/* Profile Header: Avatar, Upload Button, Info */}
      <Box
        display="flex"
        alignItems="center"
        flexDirection="column"
        mt={5}
        mb={3}
      >
        <Avatar
          src={preview}
          sx={{ width: 100, height: 100, mb: 2, bgcolor: '#333' }}
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

        <Button
          onClick={() => fileInputRef.current.click()}
          size="small"
          variant="outlined"
          sx={{
            mt: 1,
            borderColor: '#3ABEFF',
            color: '#3ABEFF',
            fontWeight: 'bold',
            '&:hover': {
              borderColor: '#FF4ECD',
              background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
              color: '#000',
            },
          }}
        >
          Upload Photo
        </Button>

        {/* Display name, username, email */}
        <Typography
          variant="h5"
          sx={{
            textTransform: 'uppercase',
            fontWeight: 'bold',
            mt: 2,
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {formData.firstName} {formData.lastName}
        </Typography>

        <Chip
          label={`@${formData.username}`}
          size="small"
          sx={{
            mt: 1,
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#000',
            fontWeight: 'bold',
          }}
        />

        <Typography variant="body2" color="gray" sx={{ mt: 0.5 }}>
          {formData.email}
        </Typography>

      </Box>

      {/* Display error or success message */}
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }}>{success}</Alert>}

      {/* Form starts here */}
      <Box component="form" onSubmit={handleSubmit} mt={3}>

        {/* Personal Info Section */}
        <Typography 
          variant="h6" 
          sx={{ 
            mb: 2, 
            textTransform: 'uppercase', 
            fontWeight: 'bold' 
          }}
        >
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
              InputLabelProps={{ sx: { color: '#BBB' } }}
              InputProps={{
                sx: {
                  color: '#FFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
                },
              }}
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
              InputLabelProps={{ sx: { color: '#BBB' } }}
              InputProps={{
                sx: {
                  color: '#FFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
                },
              }}
            />
          </Grid>
        </Grid>

        <TextField
          label="Phone Number (optional)"
          name="phoneNumber"
          type="tel"
          value={formData.phoneNumber}
          onChange={handleChange}
          disabled={updating}
          sx={{ mb: 3 }}
          fullWidth
          InputLabelProps={{ sx: { color: '#BBB' } }}
          InputProps={{
            sx: {
              color: '#FFF',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
            },
          }}
        />

        <Divider sx={{ my: 3, borderColor: '#333' }} />

        {/* Account Info Section */}
        <Typography variant="h6" sx={{ mb: 2, textTransform: 'uppercase', fontWeight: 'bold' }}>
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
          InputLabelProps={{ sx: { color: '#BBB' } }}
          InputProps={{
            sx: {
              color: '#FFF',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
            },
          }}
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
          InputLabelProps={{ sx: { color: '#BBB' } }}
          InputProps={{
            sx: {
              color: '#FFF',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
            },
          }}
        />

        <Divider sx={{ my: 3, borderColor: '#333' }} />

        {/* Password Change Section */}
        <Typography variant="h6" sx={{ mb: 2, textTransform: 'uppercase', fontWeight: 'bold' }}>
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
          InputLabelProps={{ sx: { color: '#BBB' } }}
          InputProps={{
            sx: {
              color: '#FFF',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
            },
          }}
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
              InputLabelProps={{ sx: { color: '#BBB' } }}
              InputProps={{
                sx: {
                  color: '#FFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
                },
              }}
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
              InputLabelProps={{ sx: { color: '#BBB' } }}
              InputProps={{
                sx: {
                  color: '#FFF',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3ABEFF' },
                },
              }}
            />
          </Grid>
        </Grid>

        {/* Action buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button
            variant="outlined"
            onClick={logout}
            sx={{
              borderColor: '#FF4ECD',
              color: '#FF4ECD',
              fontWeight: 'bold',
              '&:hover': {
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                color: '#000',
              },
            }}
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
                background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
              },
            }}
          >
            {updating ? <CircularProgress size={24} /> : 'Update Profile'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

