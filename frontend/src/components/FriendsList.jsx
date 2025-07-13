import { useEffect, useState, useCallback } from "react";
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

export default function FriendsList() {
  const { token, makeAuthenticatedRequest } = useAuth();
  const [usernameToAdd, setUsernameToAdd] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });           // feedback alert

  const [acceptedFriends, setAcceptedFriends] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);


  // fetch list of friends from backend
  const fetchFriends = useCallback(async () => {
    if (!token) return;
    try {
      const response = await makeAuthenticatedRequest(`/api/friends/list`);
      const data = await response.json();
      setAcceptedFriends(data.accepted || []);
      setSentRequests(data.sent || []);
      setReceivedRequests(data.received || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Could not load friends." });
    }
  }, [token, makeAuthenticatedRequest]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleAccept = async (requesterId) => {
    try {
      await makeAuthenticatedRequest(`/api/friends/accept/${requesterId}`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Friend request accepted!' });
      fetchFriends(); // Refresh the lists
    } catch (err) {
      console.error('Error accepting friend request:', err);
      setMessage({ type: "error", text: "Failed to accept request." });
    }
  };

  const handleDecline = async (requesterId) => {
    try {
      await makeAuthenticatedRequest(`/api/friends/decline/${requesterId}`, { method: 'POST' });
      setMessage({ type: 'info', text: 'Friend request declined.' });
      fetchFriends(); // Refresh the lists
    } catch (err) {
      console.error('Error declining friend request:', err);
      setMessage({ type: "error", text: "Failed to decline request." });
    }
  };


  // call when user clicks 'add', to send a friend request
  const handleAddFriend = async () => {
    if (!usernameToAdd.trim() || !token) {
      setMessage({ type: 'error', text: 'You must be logged in to add friends.' });
      return;
    }

    try {
      const response = await makeAuthenticatedRequest(`/api/friends/add`, {
        method: "POST",
        body: JSON.stringify({
          // The backend now expects 'username' based on AddFriendRequest DTO
          username: usernameToAdd.trim(),
        }),
      });

      // error message
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to add friend");
      }

      // clear input 
      setUsernameToAdd("");
      setMessage({ type: "success", text: "Friend request sent!" });
      
      // re-fetch updated list
      fetchFriends();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

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

    </Box>
  );
}
