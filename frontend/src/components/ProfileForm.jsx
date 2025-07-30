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
  Divider,
  Chip,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '../hooks/useAuth'; // custom context for auth/user management

// Get the API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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

      // Only clear preview if user has a new avatar URL (successful upload)
      // This prevents the avatar from disappearing during upload
      if (user.avatarUrl && preview) {
        console.log('User updated with new avatar, clearing preview');
        // Clean up the old preview URL
        URL.revokeObjectURL(preview);
        setPreview(null);
      }
    }
  }, [user, preview]); // Added preview as dependency

  // Handle input changes for all text fields
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setSuccess('');
  };

  // Handle file input click
  const handleUploadClick = () => {
    console.log('Upload button clicked'); // Debug log
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      console.error('File input ref is null');
    }
  };

  // Handle avatar image selection and show preview
  const handleImageChange = async (e) => {
    console.log('File input changed', e.target.files); // Debug log
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    console.log('File selected:', file.name, file.type, file.size); // Debug log

    let imageUrl = null;
    try {
      imageUrl = URL.createObjectURL(file); // temp preview URL
      setPreview(imageUrl);
      setFormData((prev) => ({
        ...prev,
        profileImageFile: file, // actual file for future upload
      }));
      
      // Immediately upload the avatar
      if (user) {
        setError('');
        setSuccess('');
        setUploadingAvatar(true);
        console.log('Starting avatar upload for user:', user.id); // Debug log
        
        try {
          const result = await uploadAvatar(user.id, file);
          console.log('Avatar upload successful:', result); // Debug log
          setSuccess('Avatar uploaded successfully!');
          
          // Clear the file from state after successful upload
          setFormData(prev => ({ ...prev, profileImageFile: null }));
          
          // DON'T clear the preview immediately - wait a moment for the user state to update
          // The useEffect will handle clearing the preview when user updates
          setTimeout(() => {
            if (imageUrl) {
              URL.revokeObjectURL(imageUrl);
            }
            setPreview(null);
          }, 1000); // Give 1 second for the user state to update
          
        } catch (err) {
          console.error('Avatar upload failed:', err); // Debug log
          setError(err.message || 'Failed to upload avatar');
          // Only clear preview on error
          setPreview(null);
          if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
          }
        } finally {
          setUploadingAvatar(false);
        }
      }
    } catch (err) {
      console.error('Error processing file:', err);
      setError('Error processing file');
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    }

    // Clear the input value to allow selecting the same file again
    e.target.value = '';
  };

  // Handle avatar removal
  const handleRemoveAvatar = async () => {
    if (!user) return;
    setError('');
    setSuccess('');
    setUploadingAvatar(true);
    try {
      await deleteAvatar(user.id);
      setPreview(null); // Clear the preview immediately
      setSuccess('Avatar removed successfully!');
    } catch (err) {
      setError(err.message || 'Failed to remove avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Get the correct avatar URL with better debugging
  const getAvatarUrl = () => {
    // If we have a preview, use it (for newly selected images)
    if (preview) {
      console.log('Using preview URL:', preview);
      return preview;
    }
    
    // If user has an avatar URL, use it
    if (user?.avatarUrl) {
      console.log('User avatarUrl:', user.avatarUrl);
      // If the avatarUrl already includes the full URL, use it as is
      if (user.avatarUrl.startsWith('http')) {
        console.log('Using full URL:', user.avatarUrl);
        return user.avatarUrl;
      }
      // Otherwise, construct the full URL
      const fullUrl = user.avatarUrl;
      console.log('Constructed URL:', fullUrl);
      return fullUrl;
    }
    
    console.log('No avatar URL available');
    return null;
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
      // Update text-based profile data only
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
          src={getAvatarUrl()}
          sx={{ width: 100, height: 100, mb: 2, bgcolor: '#333' }}
        >
          {!getAvatarUrl() && <PersonIcon fontSize="large" />}
        </Avatar>

        <Box display="flex" gap={1} mt={1}>
          {/* Hidden file input */}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ display: 'none' }}
            ref={fileInputRef}
          />
          
          {/* Upload Photo Button */}
          <Button
            onClick={handleUploadClick}
            variant="outlined"
            disabled={uploadingAvatar}
            sx={{
              borderColor: '#3ABEFF',
              color: '#3ABEFF',
              fontWeight: 'bold',
              '&:hover': {
                backgroundColor: '#3ABEFF',
                color: '#000',
              },
              '&:disabled': {
                borderColor: '#666',
                color: '#666',
              },
            }}
          >
            {uploadingAvatar ? <CircularProgress size={20} /> : 'Upload Photo'}
          </Button>
          
          {/* Remove Avatar Button */}
          {(preview || user?.avatarUrl) && (
            <Button
              onClick={handleRemoveAvatar}
              size="small"
              variant="outlined"
              color="error"
              disabled={uploadingAvatar}
              sx={{
                borderColor: '#f44336',
                color: '#f44336',
                fontWeight: 'bold',
                '&:hover': {
                  backgroundColor: '#f44336',
                  color: '#fff',
                },
                '&:disabled': {
                  borderColor: '#666',
                  color: '#666',
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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
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
        </Box>

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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
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
        </Box>

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
