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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchFriendRequests = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/friends/requests`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include'
        });
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
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/friends?status=accepted`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include'
        });
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

