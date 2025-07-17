// MUI components for modal dialog and form input
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Typography,
  Box,
} from '@mui/material';

import { useState, useEffect } from 'react';

// Modal component to share a plan with a selected friend
export default function SharePlanModal({ open, onClose, plan, friends, onShare }) {
  // Local state to track selected friend and user messages
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [message, setMessage] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedFriendId('');
      setMessage('');
    }
  }, [open]);

  // If no plan is provided, render nothing
  if (!plan) return null;

  // Called when user confirms the share action
  const handleShare = async () => {
    if (!selectedFriendId) {
      setMessage('Please select a friend.');
      return;
    }

    try {
      // Call parent-provided function to perform API request
      await onShare(plan.id, selectedFriendId);
      setMessage('Plan shared successfully!');

      // Brief success message before closing modal
      setTimeout(() => {
        setMessage('');
        onClose();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to share plan.';
      setMessage(errorMessage);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: 3,
          border: '2px solid #3ABEFF',
          p: 2,
        },
      }}
    >
      {/* Modal title showing the plan name */}
      <DialogTitle 
        sx={{ 
          fontWeight: 'bold', 
          color: '#3ABEFF',
          textAlign: 'center', 
        }}
      >
        Share "{plan.name}"
      </DialogTitle>

      {/* Content area with friend dropdown or prompt to add friends */}
      <DialogContent sx={{ color: '#fff' }}>
        {friends.length > 0 ? (
          // Dropdown menu of available friends
          <TextField
            select
            fullWidth
            label="Choose a Friend"
            value={selectedFriendId}
            onChange={(e) => setSelectedFriendId(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            InputLabelProps={{ sx: { color: '#BBB' } }}
            InputProps={{
              sx: {
                color: '#FFF',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#3ABEFF',
                },
              },
            }}
          >
            {/* List each friend as an option */}
            {friends.map((friend) => (
              <MenuItem key={friend.id} value={friend.id}>
                @{friend.username}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          // Fallback UI if the user has no friends to share with
          <Box 
            sx={{ 
              mt: 1, 
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center' 
            }}
          >
            <Typography 
              sx={{ 
                color: '#aaa', 
                mb: 0 
              }}
            >
              Looks like no one's here.
            </Typography>
            
            <Button
              onClick={() => {
                onClose(); // Close modal first
                window.location.href = '/profile?tab=friends'; // Redirect to friends tab
              }}
              sx={{
                mt: 1,
                color: '#3ABEFF',
                fontWeight: 'bold',
                textTransform: 'none',
                textDecoration: 'underline',
                '&:hover': {
                  color: '#FF4ECD',
                  textDecoration: 'none',
                },
              }}
            >
              Let's find some friends to share this with!
            </Button>
          </Box>
        )}

        {/* Feedback message for success/error */}
        {message && (
          <Typography
            sx={{
              color: message.includes('success') ? 'lightgreen' : 'red',
              mt: 1,
            }}
          >
            {message}
          </Typography>
        )}
      </DialogContent>

      {/* Modal action buttons */}
      <DialogActions 
        sx={{ 
          justifyContent: 'flex-end', 
          gap: 2, 
          mt: 0 
        }}
      >
        {/* Cancel and close modal */}
        <Button
          onClick={onClose}
          sx={{
            color: '#fff',
            textTransform: 'none',
            fontWeight: 'bold',
            textDecoration: 'underline',
            '&:hover': {
              color: '#FF4ECD',
              textDecoration: 'none',
            },
          }}
        >
          Cancel
        </Button>

        {/* Trigger share action */}
        <Button
          variant="contained"
          onClick={handleShare}
          disabled={friends.length === 0}
          sx={{
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            color: '#000',
            fontWeight: 'bold',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(to right, #5F3AFF, #FF6EDB)',
            },
          }}
        >
          Share Plan
        </Button>
      </DialogActions>
    </Dialog>
  );
}

