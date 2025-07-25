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
import { Tabs, Tab } from '@mui/material';


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
  const [tabIndex, setTabIndex] = useState(0);

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
    <Box
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'row',
        gap: 3,
        mt: 4,
      }}
    >      
      <Tabs
        orientation="vertical"
        variant="scrollable"
        value={tabIndex}
        onChange={(e, newValue) => setTabIndex(newValue)}
        sx={{
          borderRight: 1,
          borderColor: '#333',
          minWidth: 180,
          '& .MuiTabs-indicator': {
            background: 'linear-gradient(to bottom, #3ABEFF, #FF4ECD)',
            width: '3px',
          },
          '& .MuiTab-root': {
            textTransform: 'uppercase',
            fontWeight: 'bold',
            color: '#BBB',
            alignItems: 'flex-start',
          },
          '& .Mui-selected': {
            background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          },
        }}
      >
        <Tab label="Add Friend" />
        <Tab label="Friends" />
        <Tab label="Sent Requests" />
        <Tab label="Incoming Requests" />
      </Tabs>

       <Box 
        sx={{ 
          flex: 1, 
          pl: 3 
        }}
      >

      {/* Alert */}
      {message.text && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      {/* Add Friend Title */}
      <Box 
        hidden={tabIndex !== 0} sx={{ flex: 1 }}>
      <Typography
        variant="h6"
        sx={{
          mb: 1,
          fontWeight: "bold",
          fontSize: 20,
          background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: '#FFF',
        }}
      >
        Add Friend:
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
      </Box>
      

      {/* Friend List */}
      <Box hidden={tabIndex !== 1} sx={{ flex: 1 }}>
      <Typography 
        variant="subtitle1" 
        sx={{ 
          mt: 3,
          fontWeight: 'bold',
          fontSize: 18,
          background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Friends
      </Typography>
      <List>
        {acceptedFriends.map((f) => (
          <ListItem key={f.id} sx={{ px: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', mb: 2 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 'bold',
                fontSize: 22,
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: '#FFF',
                mb: 0.5,
              }}
            >
              {f.firstName && f.lastName ? `${f.firstName} ${f.lastName}` : f.username}
            </Typography>
            <Box
              sx={{
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                borderRadius: 999,
                px: 2,
                py: 0.5,
                display: 'inline-block',
                mb: 0.5,
              }}
            >
              <Typography
                sx={{
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: 15,
                  letterSpacing: 0.5,
                }}
              >
                @{f.username}
              </Typography>
            </Box>
            <Typography sx={{ color: '#aaa', fontSize: 15 }}>
              {f.email}
            </Typography>
          </ListItem>
        ))}
      </List>
      </Box>

      {/* Requests You've Sent Title */}
      <Box hidden={tabIndex !== 2} sx={{ flex: 1 }}>
      <Typography
        variant="subtitle1"
        sx={{
          mt: 3,
          fontWeight: 'bold',
          fontSize: 18,
          background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Requests You've Sent
      </Typography>
      <List>
        {sentRequests.map((f) => (
          <ListItem key={f.id} sx={{ px: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', mb: 2 }}>
            <Box
              sx={{
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                borderRadius: 999,
                px: 2,
                py: 0.5,
                display: 'inline-block',
                mb: 0.5,
              }}
            >
              <Typography
                sx={{
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: 15,
                  letterSpacing: 0.5,
                }}
              >
                @{f.username}
              </Typography>
            </Box>
          </ListItem>
        ))}
      </List>
      </Box>

      {/* Incoming Friend Requests Title */}
      <Box hidden={tabIndex !== 3} sx={{ flex: 1 }}>
      <Typography
        variant="subtitle1"
        sx={{
          mt: 3,
          fontWeight: 'bold',
          fontSize: 18,
          background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Incoming Friend Requests
      </Typography>
      <List>
        {receivedRequests.map((f) => (
          <ListItem key={f.id} sx={{ px: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', mb: 2 }}>
            <Box
              sx={{
                background: 'linear-gradient(to right, #3ABEFF, #FF4ECD)',
                borderRadius: 999,
                px: 2,
                py: 0.5,
                display: 'inline-block',
                mb: 2,
              }}
            >
              <Typography
                sx={{
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: 15,
                  letterSpacing: 0.5,
                }}
              >
                @{f.username}
              </Typography>
            </Box>
            
            <Typography 
              sx={{ 
                color: '#aaa', 
                fontSize: 15, 
                mb: 2 
              }}
            >
              {f.email}
            </Typography>
            
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button onClick={() => handleAccept(f.id)} 
                size="small" 
                variant="contained" 
                sx={{ 
                  background: "linear-gradient(to right, #3ABEFF, #FF4ECD)",
                  color: "#000",
                  fontWeight: "bold",
                  '&:hover': {
                background: '#000',
                color: '#3ABEFF',
                border: '1px solid #3ABEFF',
              },
                }}>
                Approve
              </Button>
              <Button onClick={() => handleDecline(f.id)} 
                size="small" 
                variant="outlined" 
                sx={{ 
                  color: "#FF4E4E", 
                  borderColor: "#FF4E4E",
                  fontWeight: "bold"
                }}
              >
                Reject
              </Button>
            </Box>
          </ListItem>
        ))}
      </List>
      </Box>

      {/* Plans Shared With Me Section - removed, this info already displays in a separate tab */}
    </Box>
    </Box>
  );
}
