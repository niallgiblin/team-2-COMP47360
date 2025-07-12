import { createContext, useContext, useEffect, useState } from 'react';

// Create the context
const FriendRequestContext = createContext();

// Custom hook for easy access
export const useFriendRequests = () => useContext(FriendRequestContext);

// Provider component
export const FriendRequestProvider = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState([]);

  // Fetch friend requests from backend
  const fetchFriendRequests = async () => {
    try {
      const res = await fetch("http://localhost:8080/api/friends/requests", {
        credentials: "include", // Send cookies for auth
      });
      const data = await res.json();
      setPendingRequests(data.pending || []);
    } catch (err) {
      console.error("Failed to fetch friend requests:", err);
    }
  };

  // Run on mount - TEMP commented out, for testing
  //useEffect(() => {
  //  fetchFriendRequests();
  //}, []);

  useEffect(() => {
  // TEMPORARY dummy request for UI testing
  setPendingRequests([
    {
      id: 'test123',
      from: { id: 'user1', name: 'Dummy User' },
      to: { id: 'your-user-id', name: 'You' },
      status: 'pending',
    }
  ]);
}, []);


  return (
    <FriendRequestContext.Provider value={{ pendingRequests, fetchFriendRequests }}>
      {children}
    </FriendRequestContext.Provider>
  );
};
