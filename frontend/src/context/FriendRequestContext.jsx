import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth'; // Assuming useAuth provides makeAuthenticatedRequest

const FriendRequestContext = createContext(null);

export const useFriendRequests = () => {
  const context = useContext(FriendRequestContext);
  if (!context) {
    throw new Error("useFriendRequests must be used within a FriendRequestProvider");
  }
  return context;
};

export const FriendRequestProvider = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptedFriends, setAcceptedFriends] = useState([]);
  const { makeAuthenticatedRequest, isAuthenticated } = useAuth(); // Add isAuthenticated

  const fetchFriendsData = useCallback(async () => {
    if (!makeAuthenticatedRequest) return; // Guard until the function is ready

    try {
      // Use the centralized request function which handles token and base URL
      const response = await makeAuthenticatedRequest('/api/friends/list'); 
      const data = await response.json();
      if (data) {
        // The backend returns an object with keys: accepted, sent, received
        setAcceptedFriends(data.accepted || []);
        setPendingRequests(data.received || []); // Assuming "pending" means "received" by the current user
      }
    } catch (err) {
      console.error('Failed to fetch friends data:', err);
      setAcceptedFriends([]);
      setPendingRequests([]);
    }
  }, [makeAuthenticatedRequest]);

  const clearFriendRequests = () => setPendingRequests([]);
  const clearAcceptedFriends = () => setAcceptedFriends([]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFriendsData();
    } else {
      setAcceptedFriends([]);
      setPendingRequests([]);
    }
  }, [fetchFriendsData, isAuthenticated]);

  // Expose a function to allow components to manually trigger a refresh
  const refreshFriendsData = fetchFriendsData;

  return (
    <FriendRequestContext.Provider
      value={{
        pendingRequests,
        acceptedFriends,
        refreshFriendsData,
        fetchFriendRequests: fetchFriendsData,
        fetchAcceptedFriends: fetchFriendsData,
        clearFriendRequests,
        clearAcceptedFriends,
      }}
    >
      {children}
    </FriendRequestContext.Provider>
  );
};

