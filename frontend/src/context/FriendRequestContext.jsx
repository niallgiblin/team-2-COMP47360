import { createContext, useContext, useEffect, useState } from 'react';

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

  // Use env variable or fallback to EC2 IP
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://34.246.193.191:8080/api';

  useEffect(() => {
    const fetchFriendRequests = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/friends/requests`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setPendingRequests(data);
      } catch (err) {
        console.error('Failed to fetch friend requests:', err);
      }
    };
    fetchFriendRequests();
  }, [API_BASE_URL]);

  useEffect(() => {
    const fetchAcceptedFriends = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/friends?status=accepted`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setAcceptedFriends(data);
      } catch (err) {
        console.error('Failed to fetch accepted friends:', err);
      }
    };
    fetchAcceptedFriends();
  }, [API_BASE_URL]);

  return (
    <FriendRequestContext.Provider value={{ pendingRequests, acceptedFriends }}>
      {children}
    </FriendRequestContext.Provider>
  );
};

