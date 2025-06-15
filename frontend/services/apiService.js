// API Service for making backend calls
// Base configuration
const API_BASE_URL = 'http://localhost:8080/api';

// Helper function to get auth token from localStorage
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Helper function to make authenticated requests
const makeRequest = async (url, options = {}) => {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return data;
};

// Auth API calls
export const authAPI = {
  // User login
  login: async (usernameOrEmail, password) => {
    return makeRequest(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password })
    });
  },

  // User signup
  signup: async (userData) => {
    return makeRequest(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // Get user profile
  getProfile: async (userId) => {
    return makeRequest(`${API_BASE_URL}/auth/profile?userId=${userId}`);
  },

  // Update user profile
  updateProfile: async (userId, updateData) => {
    return makeRequest(`${API_BASE_URL}/auth/profile/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
  }
};

// Friends API calls
export const friendsAPI = {
  // Get user's friends list
  getFriendsList: async (userId) => {
    return makeRequest(`${API_BASE_URL}/friends/list?userId=${userId}`);
  },

  // Search users by username
  searchUsers: async (query, currentUserId) => {
    return makeRequest(`${API_BASE_URL}/friends/search?query=${encodeURIComponent(query)}&currentUserId=${currentUserId}`);
  },

  // Add friend by username
  addFriend: async (userId, userName) => {
    return makeRequest(`${API_BASE_URL}/friends/add?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify({ userName })
    });
  }
};

// Generic API service
export const apiService = {
  // Make authenticated request (for custom API calls)
  makeAuthenticatedRequest: makeRequest,
  
  // Get current user's data from localStorage
  getCurrentUser: () => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    const token = getAuthToken();
    const user = apiService.getCurrentUser();
    return !!(token && user);
  },

  // Clear authentication data
  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

// Example usage functions for testing
export const testAPI = {
  // Test authentication system
  testAuth: async () => {
    try {
      console.log('Testing authentication system...');
      
      // Test signup
      const signupData = {
        username: 'testuser_' + Date.now(),
        email: `test_${Date.now()}@example.com`,
        password: 'testpass123',
        firstName: 'Test',
        lastName: 'User'
      };
      
      console.log('Testing signup...');
      const signupResult = await authAPI.signup(signupData);
      console.log('Signup successful:', signupResult);

      // Test login
      console.log('Testing login...');
      const loginResult = await authAPI.login(signupData.usernameOrEmail, signupData.password);
      console.log('Login successful:', loginResult);

      // Test get profile
      console.log('Testing get profile...');
      const profile = await authAPI.getProfile(loginResult.user.id);
      console.log('Profile retrieved:', profile);

      return { success: true, data: { signup: signupResult, login: loginResult, profile } };
    } catch (error) {
      console.error('Auth test failed:', error);
      return { success: false, error: error.message };
    }
  },

  // Test friends functionality
  testFriends: async (userId = 1) => {
    try {
      console.log('Testing friends system...');
      
      // Test get friends list
      console.log('Testing get friends list...');
      const friendsList = await friendsAPI.getFriendsList(userId);
      console.log('Friends list:', friendsList);

      // Test search users
      console.log('Testing search users...');
      const searchResults = await friendsAPI.searchUsers('test', userId);
      console.log('Search results:', searchResults);

      return { success: true, data: { friendsList, searchResults } };
    } catch (error) {
      console.error('Friends test failed:', error);
      return { success: false, error: error.message };
    }
  }
};