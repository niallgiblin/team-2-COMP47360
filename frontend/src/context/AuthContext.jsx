import { createContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export const AuthContext = createContext(null);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://34.244.154.146:8080/api';

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("token")
  );
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  }, [navigate]);

  // On first load, validate the token from localStorage with the backend.
  useEffect(() => {
    const validateToken = async () => {
      const savedToken = localStorage.getItem("token");
      if (savedToken) {
        try {
          const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` },
          });

          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(savedToken);
            setIsAuthenticated(true);
            localStorage.setItem("user", JSON.stringify(userData));
          } else {
            logout();
          }
        } catch (error) {
          console.error("Token validation failed:", error);
          logout();
        }
      }
      setLoading(false);
    };
    validateToken();
  }, [logout]);

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = useCallback(
    async (url, options = {}) => {
      const currentToken = localStorage.getItem("token");
      if (!currentToken) {
        logout();
        throw new Error("Not authenticated. Please log in.");
      }
      const headers = { ...options.headers };
      if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }
      headers["Authorization"] = `Bearer ${currentToken}`;
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please log in again.");
      }
      return response;
    },
    [logout]
  );

  // Login function
  const login = async (usernameOrEmail, password) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernameOrEmail, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
    setUser(data.user);
    setToken(data.token);
    setIsAuthenticated(true);
    navigate("/");
    return { success: true, user: data.user };
  };

  // Signup function
  const signup = async (userData) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Signup failed");
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
    setUser(data.user);
    setToken(data.token);
    setIsAuthenticated(true);
    navigate("/");
    return { success: true, user: data.user };
  };

  // Update user profile (text data)
  const updateProfile = async (userId, updateData) => {
    const response = await makeAuthenticatedRequest(
      `${API_BASE_URL}/auth/profile/${userId}`,
      {
        method: "PUT",
        body: JSON.stringify(updateData),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to update profile");
    setUser(data.user);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  };

  // Upload user avatar (file data)
  const uploadAvatar = async (userId, file) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await makeAuthenticatedRequest(
      `${API_BASE_URL}/auth/profile/${userId}/avatar`,
      {
        method: "POST",
        body: formData,
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to upload avatar");
    setUser(data.user);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  };

  // Delete user avatar
  const deleteAvatar = async (userId) => {
    const response = await makeAuthenticatedRequest(
      `${API_BASE_URL}/auth/profile/${userId}/avatar`,
      {
        method: "DELETE",
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to delete avatar");
    setUser(data.user);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  };

  const value = {
    user,
    token,
    isAuthenticated,
    loading,
    login,
    signup,
    logout,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    makeAuthenticatedRequest,
  };

  if (loading) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
