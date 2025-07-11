import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Create the context
const AuthContext = createContext();

// Custom hook for easy access
export const useAuth = () => useContext(AuthContext);

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

// AuthProvider component that wraps your app
export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // On first load, check if user is already logged in (via localStorage)
  useEffect(() => {
    try {
      const savedUser = JSON.parse(localStorage.getItem('user'));
      const savedToken = localStorage.getItem('token');

      if (savedUser && savedToken) {
        setUser(savedUser);
        setToken(savedToken);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error loading saved auth data:', error);
      // Clear corrupted data
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  };

  // Login function - matches backend LoginRequest format
  const login = async (usernameOrEmail, password) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          usernameOrEmail,  // Backend expects this field name
          password 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Backend returns: { message, user, token }
      setUser(data.user);
      setToken(data.token);
      setIsAuthenticated(true);

      // Save to localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);

      navigate('/'); // Go to home page after login
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Signup function - matches backend SignUpRequest format
  const signup = async (userData) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: userData.username,    // Required
          email: userData.email,          // Required
          password: userData.password,    // Required
          firstName: userData.firstName,  // Required
          lastName: userData.lastName,    // Required
          phoneNumber: userData.phoneNumber || null // Optional
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Backend returns: { message, user, token }
      setUser(data.user);
      setToken(data.token);
      setIsAuthenticated(true);

      // Save to localStorage
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);

      navigate('/'); // Go to home page after signup
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Signup failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Get user profile by ID
  const getUserProfile = async (userId) => {
    try {
      const response = await makeAuthenticatedRequest(
        `${API_BASE_URL}/auth/profile?userId=${userId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get user profile');
      }

      return data.user;
    } catch (error) {
      console.error('Get profile failed:', error);
      throw error;
    }
  };

  // Update user profile
  const updateProfile = async (userId, updateData) => {
    try {
      const response = await makeAuthenticatedRequest(
        `${API_BASE_URL}/auth/profile/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update local user data
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data.user;
    } catch (error) {
      console.error('Update profile failed:', error);
      throw error;
    }
  };

  // Logout function
  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);

    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Check if user is authenticated (useful for protected routes)
  const checkAuth = () => {
    return isAuthenticated && user && token;
  };

  const value = {
    // State
    user,
    token,
    isAuthenticated,
    loading,
    
    // Actions
    login,
    signup,
    logout,
    getUserProfile,
    updateProfile,
    checkAuth,
    makeAuthenticatedRequest
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
