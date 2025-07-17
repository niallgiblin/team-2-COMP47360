import { createContext, useContext, useEffect, useState } from 'react';

const FriendRequestContext = createContext(null); // null default prevents undefined access

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

  const fetchFriendRequests = async () => {
    try {
      const res = await fetch("http://localhost:8080/api/friends/requests", {
        credentials: "include",
      });
      const data = await res.json();
      setPendingRequests(data.pending || []);
    } catch (err) {
      console.error("Failed to fetch friend requests:", err);
      setPendingRequests([]); // ensure it's always an array
    }
  };

  const fetchAcceptedFriends = async () => {
    try {
      const res = await fetch("http://localhost:8080/api/friends?status=accepted", {
        credentials: "include",
      });
      const data = await res.json();
      setAcceptedFriends([
        ...(Array.isArray(data) ? data : []),
        { id: 'dummy123', username: 'testfriend' }, // TEMP: remove later
      ]);
    } catch (err) {
      console.error("Failed to fetch accepted friends:", err);
      setAcceptedFriends([]); // fallback
    }
  };

  useEffect(() => {
    fetchFriendRequests();
    fetchAcceptedFriends();
  }, []);

  return (
    <FriendRequestContext.Provider
      value={{
        pendingRequests,
        acceptedFriends,
        fetchFriendRequests,
        fetchAcceptedFriends,
      }}
    >
      {children}
    </FriendRequestContext.Provider>
  );
};

