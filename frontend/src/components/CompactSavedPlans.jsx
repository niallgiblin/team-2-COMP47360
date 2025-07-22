// displays the user's saved plans as summary cards, in a horizontally scrollable container
// allows the user to reload a selected plan
// Used on the MapView page

import { Box, Typography, Button, IconButton } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { usePlan } from '../context/PlanContext';
import { useNavigate } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useAuth } from '../hooks/useAuth';

export default function CompactSavedPlans({ setViewMode }) {
  const { savedPlans, loadPlan } = usePlan();
  const { makeAuthenticatedRequest } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (scrollRef.current) {
        setShowArrows(scrollRef.current.scrollWidth > scrollRef.current.clientWidth);
      }
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [savedPlans]);

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [shareMessage, setShareMessage] = useState('');

  // scroll container
  const handleScroll = (direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollAmount = 300;
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  const handleOpenShare = async (plan) => {
    setSelectedPlan(plan);
    setShareDialogOpen(true);
    setShareMessage('');
    // Fetch friends list
    try {
      const res = await makeAuthenticatedRequest('/api/friends/list');
      const data = await res.json();
      setFriends(data.accepted || []);
      setSelectedFriends([]);
    } catch {
      setFriends([]);
    }
  };

  const handleCloseShare = () => {
    setShareDialogOpen(false);
    setSelectedPlan(null);
    setSelectedFriends([]);
    setShareMessage('');
  };

  const handleToggleFriend = (friendId) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleShare = async () => {
    if (!selectedPlan || selectedFriends.length === 0) return;
    try {
      const res = await makeAuthenticatedRequest('/api/plans/share', {
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlan.id, userIds: selectedFriends })
      });
      if (res.ok) {
        setShareMessage('Plan shared!');
      } else {
        setShareMessage('Failed to share plan.');
      }
    } catch {
      setShareMessage('Failed to share plan.');
    }
  };

  if (!savedPlans || savedPlans.length === 0) {
    return (
      <Typography 
        sx={{ 
            mt: 2, 
            color: '#888', 
            textAlign: 'center' 
        }}
    >
        You haven’t saved any plans yet.
      </Typography>
    );
  }

  return (
    <Box>
      
      {/* Title */}
      <Typography
        variant="subtitle1"
        sx={{
          color: '#fff',
          fontWeight: 'bold',
          mb: 1,
        }}
      >
        Your Saved Plans
      </Typography>

      <Box 
        sx={{ 
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
        }}
    >
        {/* Left chevron */}
        {showArrows && (
          <IconButton
            onClick={() => handleScroll('left')}
            sx={{
              position: 'absolute',
              left: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              color: '#FF4ECD',
              backgroundColor: '#000',
              '&:hover': {
                  backgroundColor: '#111',
              },
            }}
          >
            <ChevronLeft />
          </IconButton>
        )}

        {/* Right chevron */}
        {showArrows && (
          <IconButton
            onClick={() => handleScroll('right')}
            sx={{
              position: 'absolute',
              right: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              color: '#FF4ECD',
              backgroundColor: '#000',
              '&:hover': {
                  backgroundColor: '#111',
              },
            }}
          >
            <ChevronRight />
          </IconButton>
        )}

        {/* Scrollable cards */}
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            position: 'relative',
            overflowX: 'auto',
            gap: 2,
            pb: 1,
            px: 2,
          }}
        >
          {savedPlans.map((plan) => (
            <Box
              key={plan.id}
              sx={{
                minWidth: 180,
                maxWidth: 250,
                backgroundColor: '#111',
                border: '1px solid #900B6A',
                borderRadius: 2,
                p: 2,
                flexShrink: 0,
              }}
            >
              <Typography
                variant="body1"
                sx={{ color: '#fff', fontWeight: 'bold', mb: 1 }}
              >
                {plan.name}
              </Typography>

              <Typography variant="caption" sx={{ color: '#aaa', mb: 2, display: 'block' }}>
                Saved: {new Date(plan.createdAt).toLocaleDateString()}
              </Typography>

              <Button
                fullWidth
                onClick={() => {
                  loadPlan(plan.venues);
                  setViewMode('plan'); // switch back to Current Plan tab
                  navigate('/map', { state: { fromPlan: true } });
                }}
                variant="contained"
                sx={{
                  mt: 1,
                  background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                  fontWeight: 'bold',
                  color: '#000',
                  textTransform: 'none',
                }}
              >
                View on Map
              </Button>
              <Button
                fullWidth
                onClick={() => handleOpenShare(plan)}
                variant="outlined"
                sx={{
                  mt: 1,
                  borderColor: '#3ABEFF',
                  color: '#3ABEFF',
                  fontWeight: 'bold',
                  textTransform: 'none',
                }}
              >
                Share
              </Button>
            </Box>
          ))}
        </Box>
      </Box>
      {/* Share Plan Dialog */}
      <Dialog open={shareDialogOpen} onClose={handleCloseShare}>
        <DialogTitle>Share Plan</DialogTitle>
        <DialogContent>
          {friends.length === 0 ? (
            <Typography>No friends to share with.</Typography>
          ) : (
            friends.map((friend) => (
              <FormControlLabel
                key={friend.id}
                control={
                  <Checkbox
                    checked={selectedFriends.includes(friend.id)}
                    onChange={() => handleToggleFriend(friend.id)}
                  />
                }
                label={`@${friend.username}`}
              />
            ))
          )}
          {shareMessage && (
            <Typography sx={{ mt: 2, color: shareMessage.includes('shared') ? 'green' : 'red' }}>{shareMessage}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseShare}>Cancel</Button>
          <Button onClick={handleShare} disabled={selectedFriends.length === 0 || !selectedPlan}>Share</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

