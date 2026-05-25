// API Service for making backend calls
import { resolveApiBaseUrl, joinApiPath, resolveLlmApiUrl, resolveAvatarUrl } from './apiUrls';

// Re-export url helpers for consumers that import from apiService
export { resolveApiBaseUrl, joinApiPath, resolveLlmApiUrl, resolveAvatarUrl } from './apiUrls';

// Helper function to get auth token from localStorage
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Unauthenticated JSON request helper (used by authAPI, friendsAPI)
// Authenticated requests use AuthContext.makeAuthenticatedRequest (D-10)
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
  login: async (usernameOrEmail, password) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), '/auth/login'), {
      method: 'POST',
      body: JSON.stringify({ usernameOrEmail, password }),
    });
  },

  signup: async (userData) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), '/auth/signup'), {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  getProfile: async (userId) => {
    return makeRequest(`${joinApiPath(resolveApiBaseUrl(), '/auth/profile')}?userId=${userId}`);
  },

  updateProfile: async (userId, updateData) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), `/auth/profile/${userId}`), {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  },
};

// Friends API calls
export const friendsAPI = {
  getFriendsList: async (userId) => {
    return makeRequest(`${joinApiPath(resolveApiBaseUrl(), '/friends/list')}?userId=${userId}`);
  },

  searchUsers: async (query, currentUserId) => {
    return makeRequest(
      `${joinApiPath(resolveApiBaseUrl(), '/friends/search')}?query=${encodeURIComponent(query)}&currentUserId=${currentUserId}`
    );
  },

  addFriend: async (userId, userName) => {
    return makeRequest(`${joinApiPath(resolveApiBaseUrl(), '/friends/add')}?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify({ userName }),
    });
  },
};

// Plan API calls — path builders for /plans endpoints (D-09, D-11)
export const planAPI = {
  getPlans: async () => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), '/plans'));
  },

  getSharedWithMe: async () => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), '/plans/shared-with-me'));
  },

  getPlanById: async (id) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), `/plans/${id}`));
  },

  createPlan: async (planData) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), '/plans'), {
      method: 'POST',
      body: JSON.stringify(planData),
    });
  },

  updatePlan: async (id, planData) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), `/plans/${id}`), {
      method: 'PUT',
      body: JSON.stringify(planData),
    });
  },

  deletePlan: async (id) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), `/plans/${id}`), {
      method: 'DELETE',
    });
  },
};

// Vibe API — URL builders for vibe/search endpoints (path-builder foundation, D-09)
export const vibeAPI = {
  searchUrl: () => joinApiPath(resolveApiBaseUrl(), '/vibe/search'),
  mapDataUrl: () => joinApiPath(resolveApiBaseUrl(), '/vibe/map-data'),
  trendingUrl: () => joinApiPath(resolveApiBaseUrl(), '/vibe/trending'),
};

// Chat API — unauthenticated POST per D-15; no Bearer token required
export const chatAPI = {
  sendMessage: async (message, history) => {
    const response = await fetch(resolveLlmApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },
};

// Generic API service utilities
export const apiService = {
  makeAuthenticatedRequest: makeRequest,

  getCurrentUser: () => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  },

  isAuthenticated: () => {
    const token = getAuthToken();
    const user = apiService.getCurrentUser();
    return !!(token && user);
  },

  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

// Example usage functions for testing
export const testAPI = {
  testAuth: async () => {
    try {
      console.log('Testing authentication system...');

      const signupData = {
        username: 'testuser_' + Date.now(),
        email: `test_${Date.now()}@example.com`,
        password: 'testpass123',
        firstName: 'Test',
        lastName: 'User',
      };

      console.log('Testing signup...');
      const signupResult = await authAPI.signup(signupData);
      console.log('Signup successful:', signupResult);

      console.log('Testing login...');
      const loginResult = await authAPI.login(signupData.usernameOrEmail, signupData.password);
      console.log('Login successful:', loginResult);

      console.log('Testing get profile...');
      const profile = await authAPI.getProfile(loginResult.user.id);
      console.log('Profile retrieved:', profile);

      return { success: true, data: { signup: signupResult, login: loginResult, profile } };
    } catch (error) {
      console.error('Auth test failed:', error);
      return { success: false, error: error.message };
    }
  },

  testFriends: async (userId = 1) => {
    try {
      console.log('Testing friends system...');

      console.log('Testing get friends list...');
      const friendsList = await friendsAPI.getFriendsList(userId);
      console.log('Friends list:', friendsList);

      console.log('Testing search users...');
      const searchResults = await friendsAPI.searchUsers('test', userId);
      console.log('Search results:', searchResults);

      return { success: true, data: { friendsList, searchResults } };
    } catch (error) {
      console.error('Friends test failed:', error);
      return { success: false, error: error.message };
    }
  },
};
