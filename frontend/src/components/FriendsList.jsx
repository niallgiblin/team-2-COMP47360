import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Alert,
} from "@mui/material";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from '../context/PlanContext';
import { useNavigate } from 'react-router-dom';
import { useState as useReactState } from 'react';
import { useFriendRequests } from '../context/FriendRequestContext';

export default function FriendsList() {
  const { token, makeAuthenticatedRequest } = useAuth();
  const [usernameToAdd, setUsernameToAdd] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });           // feedback alert

  const {
    acceptedFriends,
    fetchFriendRequests,
    fetchAcceptedFriends,
  } = useFriendRequests();

  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sharedPlans, setSharedPlans] = useState([]);
  const { loadPlan, clearPlan, savePlanFromVenues, refreshSavedPlans, savedPlans } = usePlan();
  const navigate = useNavigate();
  const [saveMsg, setSaveMsg] = useReactState('');

  // Load sent and received friend requests separately
  const fetchSentAndReceived = useCallback(async () => {
    if (!token) return;
    try {
      const response = await makeAuthenticatedRequest(`/api/friends/list`);
      const data = await response.json();
      setSentRequests(data.sent || []);
      setReceivedRequests(data.received || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Could not load friend requests." });
    }
  }, [token, makeAuthenticatedRequest]);

  const fetchSharedPlans = useCallback(async () => {
    if (!token) return;
    try {
      const response = await makeAuthenticatedRequest(`/api/plans/shared-with-me`);
      const data = await response.json();
      setSharedPlans(data.sharedPlans || []);
    } catch {
      setSharedPlans([]);
    }
  }, [token, makeAuthenticatedRequest]);

  useEffect(() => {
    fetchFriendRequests();
    fetchAcceptedFriends();
    fetchSentAndReceived();
    fetchSharedPlans();
  }, [fetchFriendRequests, fetchAcceptedFriends, fetchSentAndReceived, fetchSharedPlans]);

  const handleAccept = async (requesterId) => {
    try {
      await makeAuthenticatedRequest(`/api/friends/accept/${requesterId}`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Friend request accepted!' });
      fetchFriendRequests();
      fetchAcceptedFriends();
      fetchSentAndReceived();
    } catch (err) {
      console.error('Error accepting friend request:', err);
      setMessage({ type: "error", text: "Failed to accept request." });
    }
  };

  const handleDecline = async (requesterId) => {
    try {
      await makeAuthenticatedRequest(`/api/friends/decline/${requesterId}`, { method: 'POST' });
      setMessage({ type: 'info', text: 'Friend request declined.' });
      fetchFriendRequests();
      fetchSentAndReceived();
    } catch (err) {
      console.error('Error declining friend request:', err);
      setMessage({ type: "error", text: "Failed to decline request." });
    }
  };

  const handleAddFriend = async () => {
    if (!usernameToAdd.trim() || !token) {
      setMessage({ type: 'error', text: 'You must be logged in to add friends.' });
      return;
    }

    try {
      const response = await makeAuthenticatedRequest(`/api/friends/add`, {
        method: "POST",
        body: JSON.stringify({ username: usernameToAdd.trim() }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to add friend");
      }

      setUsernameToAdd("");
      setMessage({ type: "success", text: "Friend request sent!" });
      fetchFriendRequests();
      fetchSentAndReceived();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const sharedPlansBySharer = useMemo(() => {
    const grouped = {};
    for (const sp of sharedPlans) {
      const sharer = sp.sharedBy?.username || 'Unknown';
      if (!grouped[sharer]) grouped[sharer] = [];
      grouped[sharer].push(sp.plan);
    }
    return grouped;
  }, [sharedPlans]);


  return (
    <Box>
      <Typography 
        variant="h6" 
        sx={{ 
          mb: 2, fontWeight: "bold", color: "#fff" }}>
        Your Friends
      </Typography>

      {/* Friend Add Input */}
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <TextField
          label="Username"
          variant="outlined"
          size="small"
          value={usernameToAdd}
          onChange={(e) => setUsernameToAdd(e.target.value)}
          sx={{
            flex: 1,
            "& .MuiInputBase-input": { color: "white" },
            "& .MuiInputLabel-root": { color: "#BBB" },
            "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
              borderColor: "#3ABEFF",
            },
          }}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          onClick={handleAddFriend}
          variant="contained"
          sx={{
            background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
            color: "#000",
            fontWeight: "bold",
            px: 3,
          }}
        >
          Add
        </Button>
      </Box>

      {/* Alert */}
      {message.text && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      {/* Friend List */}
      <Typography 
        variant="subtitle1" 
        sx={{ 
          color: "#fff", 
          mt: 3 
        }}
      >
        Accepted Friends
      </Typography>
        <List>
          {acceptedFriends.map((f) => (
            <ListItem 
              key={f.id} 
              sx={{ 
                px: 0 
              }}
            >
              <ListItemText primary={`@${f.username}`} primaryTypographyProps={{ color: "#fff" }} />
            </ListItem>
          ))}
        </List>

        <Typography 
          variant="subtitle1" 
          sx={{ 
            color: "#fff", 
            mt: 3 
          }}
          >
            Requests You've Sent
        </Typography>
        <List>
          {sentRequests.map((f) => (
            <ListItem key={f.id} sx={{ px: 0 }}>
              <ListItemText primary={`@${f.username} (Request Sent)`} primaryTypographyProps={{ color: "#BBB" }} />
            </ListItem>
          ))}
        </List>

        <Typography variant="subtitle1" sx={{ color: "#fff", mt: 3 }}>Incoming Friend Requests</Typography>
        <List>
          {receivedRequests.map((f) => (
            <ListItem key={f.id} sx={{ px: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <ListItemText primary={`@${f.username}`} primaryTypographyProps={{ color: "#fff" }} />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button onClick={() => handleAccept(f.id)} 
                  size="small" 
                  variant="contained" 
                  sx={{ 
                    backgroundColor: "#4CAF50" 
                  }}>
                  Approve
                </Button>
                <Button onClick={() => handleDecline(f.id)} 
                  size="small" 
                  variant="outlined" 
                  sx={{ 
                    color: "#FF4E4E", 
                    borderColor: "#FF4E4E" 
                  }}
                >
                  Reject
                </Button>
              </Box>
            </ListItem>
          ))}
        </List>

      {/* Plans Shared With Me Section */}
      <Typography variant="h6" sx={{ mt: 4, fontWeight: "bold", color: "#fff" }}>
        Plans Shared With Me
      </Typography>
      {Object.keys(sharedPlansBySharer).length === 0 ? (
        <Typography sx={{ color: '#aaa', mt: 1 }}>No plans have been shared with you yet.</Typography>
      ) : (
        Object.entries(sharedPlansBySharer).map(([sharer, plans]) => (
          <Box key={sharer} sx={{ mt: 2, mb: 2, p: 2, background: '#181828', borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ color: '#3ABEFF', fontWeight: 'bold' }}>
              Shared by @{sharer}
            </Typography>
            {plans.map((plan) => (
              <Box key={plan.id} sx={{ mt: 1, mb: 1, p: 1, background: '#222', borderRadius: 1 }}>
                <Typography sx={{ color: '#fff', fontWeight: 'bold' }}>{plan.name}</Typography>
                <Typography sx={{ color: '#aaa', fontSize: 13 }}>
                  Saved: {new Date(plan.createdAt).toLocaleDateString()}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    sx={{ background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)', color: '#000', fontWeight: 'bold' }}
                    onClick={() => {
                      clearPlan();
                      console.log('Loading plan venues:', plan.venues);
                      if (!Array.isArray(plan.venues) || plan.venues.length === 0) {
                        setSaveMsg('No venues to load for this plan.');
                        setTimeout(() => setSaveMsg(''), 2000);
                        return;
                      }
                      loadPlan(plan.venues); // Set plan context to array of venues
                      navigate('/map', { state: { fromPlan: true } });
                    }}
                  >
                    View on Map
                  </Button>
                  {/* Save Plan button logic */}
                  {(() => {
                    // Check if this plan is already saved (by name and venues)
                    const isAlreadySaved = savedPlans.some(saved => {
                      if (saved.name === plan.name + ' (Copy)' && saved.venues && plan.venues) {
                        const savedIds = saved.venues.map(v => v.id).sort().join(',');
                        const planIds = plan.venues.map(v => v.id).sort().join(',');
                        return savedIds === planIds;
                      }
                      return false;
                    });
                    return (
                      <Button
                        variant="outlined"
                        size="small"
                        disabled={isAlreadySaved}
                        sx={{
                          borderColor: isAlreadySaved ? '#555' : '#3ABEFF',
                          color: isAlreadySaved ? '#555' : '#3ABEFF',
                          fontWeight: 'bold',
                          background: isAlreadySaved ? '#222' : 'none',
                          cursor: isAlreadySaved ? 'not-allowed' : 'pointer',
                        }}
                        onClick={async () => {
                          if (!plan.venues || plan.venues.length === 0) {
                            setSaveMsg('No venues to save.');
                            setTimeout(() => setSaveMsg(''), 2000);
                            return;
                          }
                          const newPlan = await savePlanFromVenues(plan.name + ' (Copy)', plan.venues);
                          if (newPlan) {
                            setSaveMsg('Plan saved!');
                            await refreshSavedPlans();
                          } else {
                            setSaveMsg('Failed to save plan.');
                          }
                          setTimeout(() => setSaveMsg(''), 2000);
                        }}
                      >
                        {isAlreadySaved ? 'Plan Saved' : 'Save Plan'}
                      </Button>
                    );
                  })()}
                </Box>
                {saveMsg && (
                  <Typography sx={{ color: saveMsg.includes('saved') ? 'green' : 'red', fontSize: 13, mt: 1 }}>{saveMsg}</Typography>
                )}
              </Box>
            ))}
          </Box>
        ))
      )}

    </Box>
  );
}
