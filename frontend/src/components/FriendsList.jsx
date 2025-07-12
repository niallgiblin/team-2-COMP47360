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
import { useAuth } from "../context/AuthContext";


export default function FriendsList() {
  const { user } = useAuth();   
  const [usernameToAdd, setUsernameToAdd] = useState("");                   // input field for new friend
  const [message, setMessage] = useState({ type: "", text: "" });           // feedback alert

  const [acceptedFriends, setAcceptedFriends] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);


  // fetch list of friends from backend
  const fetchFriends = useCallback(async () => {
    if (!user) return; // Don't fetch if user is not logged in
    try {
      const res = await fetch(`http://localhost:8080/api/friends/${user.id}`);
      if (!res.ok) throw new Error("Failed to fetch friends");
      const data = await res.json();
      setAcceptedFriends(data.accepted || []);
      setSentRequests(data.sent || []);
      setReceivedRequests(data.received || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Could not load friends." });
    }
  }, [user]);

  // fetch friend list when component mounts or user changes
  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // approve friend request
  const handleAccept = async (requestId) => {
    try {
      await fetch(`http://localhost:8080/api/friends/accept/${requestId}`, {
        method: 'POST',
        credentials: 'include',
      });
      await fetchFriends(); // refresh list
    } catch (err) {
      console.error('Error accepting friend request:', err);
      setMessage({ type: "error", text: "Failed to accept request." });
    }
  };

  // reject friend request
  const handleDecline = async (requestId) => {
    try {
      await fetch(`http://localhost:8080/api/friends/decline/${requestId}`, {
        method: 'POST',
        credentials: 'include',
      });
      await fetchFriends(); // refresh list
    } catch (err) {
      console.error('Error declining friend request:', err);
      setMessage({ type: "error", text: "Failed to decline request." });
    }
  };


  // call when user clicks 'add', to send a friend request
  const handleAddFriend = async () => {
    if (!usernameToAdd.trim() || !user) return;

    try {
      const res = await fetch("http://localhost:8080/api/friends/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          friendUsername: usernameToAdd.trim(),
        }),
      });

      // error message
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Failed to add friend");

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
              <ListItemText primary={`@${f.username}`} primaryTypographyProps={{ color: "#BBB" }} />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button onClick={() => handleAccept(f.requestId)} 
                  size="small" 
                  variant="contained" 
                  sx={{ 
                    backgroundColor: "#4CAF50" 
                  }}>
                  Approve
                </Button>
                <Button onClick={() => handleDecline(f.requestId)} 
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
