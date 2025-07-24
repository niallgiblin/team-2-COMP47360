// allows authenticated users to view and edit their account
// used on the Profile.jsx page

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
import { useAuth } from '../hooks/useAuth'; // custom context for auth/user management

// Main profile form component
export default function ProfileForm() {
  // Access user object and relevant auth functions
  const { user, updateProfile, uploadAvatar, deleteAvatar, logout, loading } = useAuth();

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
    profileImageFile: null, // for uploading profile picture later
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
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        username: user.username || '',
        phoneNumber: user.phoneNumber || '',
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
        profileImageFile: null,
      });

      // If user already has an avatar, use its URL for the preview
      if (user.avatarUrl) setPreview(user.avatarUrl);
    }
  }, [user]);

  // Handle input changes for all text fields
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setSuccess('');
  };

  // Handle avatar image selection and show preview
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file); // temp preview URL
      setPreview(imageUrl);
      setFormData((prev) => ({
        ...prev,
        profileImageFile: file, // actual file for future upload
      }));
    }
  };

  // Handle avatar removal
  const handleRemoveAvatar = async () => {
    if (!user) return;
    setError('');
    setSuccess('');
    setUpdating(true);
    try {
      await deleteAvatar(user.id);
      setPreview(null); // Clear the preview immediately
      setSuccess('Avatar removed successfully!');
    } catch (err) {
      setError(err.message || 'Failed to remove avatar');
    } finally {
      setUpdating(false);
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
      // Step 1: Update text-based profile data
      const updateData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        username: formData.username.trim(),
        phoneNumber: formData.phoneNumber.trim() || null,
      };
      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }
      await updateProfile(user.id, updateData);

      // Step 2: If a new avatar file was selected, upload it
      if (formData.profileImageFile) {
        await uploadAvatar(user.id, formData.profileImageFile);
        // Clear the file from state after successful upload
        setFormData(prev => ({ ...prev, profileImageFile: null }));
      }

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

  // While loading user data
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

        <Box display="flex" gap={1} mt={1}>
          <Button
            onClick={() => fileInputRef.current.click()}
            size="small"
            variant="outlined"
            sx={{
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
          {preview && (
            <Button
              onClick={handleRemoveAvatar}
              size="small"
              variant="outlined"
              color="error"
              sx={{
                borderColor: '#f44336',
                color: '#f44336',
                fontWeight: 'bold',
                '&:hover': {
                  backgroundColor: '#f44336',
                  color: '#fff',
                },
              }}
            >
              Remove
            </Button>
          )}
        </Box>

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
        {/* Removed last login display */}
      </Box>

      {/* Display error or success message */}
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }}>{success}</Alert>}

      {/* Form starts here */}
      <Box component="form" onSubmit={handleSubmit} mt={3}>

        {/* Personal Info Section */}
        <Typography variant="h6" sx={{ mb: 2, textTransform: 'uppercase', fontWeight: 'bold' }}>
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

        <Divider 
          sx={{ 
            my: 3, 
            borderColor: '#333' 
          }} 
        />

        {/* Account Info Section */}
        <Typography 
          variant="h6" 
          sx={{ 
            mb: 2, 
            textTransform: 'uppercase', 
            fontWeight: 'bold' 
          }}
        >
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
