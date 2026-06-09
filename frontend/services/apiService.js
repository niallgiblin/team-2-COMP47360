// API Service for making backend calls
import { resolveApiBaseUrl, joinApiPath, resolveLlmApiUrl, resolveAvatarUrl } from './apiUrls';

// Re-export url helpers for consumers that import from apiService
export { resolveApiBaseUrl, joinApiPath, resolveLlmApiUrl, resolveAvatarUrl } from './apiUrls';

// Helper function to get auth token from localStorage
const getAuthToken = () => {
  return localStorage.getItem('token');
};

// Authenticated fetch — attaches Bearer token when present (required for /api/vibe/*).
export const authFetch = async (url, options = {}) => {
  const token = getAuthToken();
  const headers = { ...options.headers };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    const { invokeAuthLogout, invalidateClientCaches } = await import('../src/cache/invalidateClientCaches');
    if (!invokeAuthLogout()) {
      invalidateClientCaches();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
  return response;
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
  mapDataUrl: (bbox) => {
    const base = joinApiPath(resolveApiBaseUrl(), '/vibe/map-data');
    if (bbox == null) {
      return base;
    }
    const params = new URLSearchParams({
      minLat: String(bbox.minLat),
      maxLat: String(bbox.maxLat),
      minLng: String(bbox.minLng),
      maxLng: String(bbox.maxLng),
    });
    return `${base}?${params.toString()}`;
  },
  trendingUrl: () => joinApiPath(resolveApiBaseUrl(), '/vibe/trending'),
  googleReviewsUrl: (locationId) => joinApiPath(resolveApiBaseUrl(), `/vibe/venue/${locationId}/google-reviews`),
};

export const locationAPI = {
  getLocationById: async (id) => {
    return makeRequest(joinApiPath(resolveApiBaseUrl(), `/locations/${id}`));
  },

  searchLocations: async (input, size = 1) => {
    const params = new URLSearchParams({
      input: String(input || ''),
      size: String(size),
    });
    return makeRequest(`${joinApiPath(resolveApiBaseUrl(), '/locations/search')}?${params.toString()}`);
  },
};

// Chat API — proxied Flask route requires the same Bearer JWT boundary as Spring.
export const chatAPI = {
  sendMessage: async (message, history) => {
    const previous_questions = [];
    const previous_responses = [];
    let pendingQuestion = null;

    (history || []).forEach((m) => {
      if (m.sender === 'user' && m.text) {
        pendingQuestion = m.text;
        previous_questions.push(m.text);
      } else if (m.sender === 'bot' && m.text && pendingQuestion) {
        previous_responses.push(m.text);
        pendingQuestion = null;
      }
    });

    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(resolveLlmApiUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        previous_questions: previous_questions.slice(-3),
        previous_responses: previous_responses.slice(-3),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Stream a chat message via SSE (Server-Sent Events).
   *
   * Calls ``/api/chat/stream`` with the same payload as ``sendMessage``
   * and reads the response as a text/event-stream.  ``onToken`` is called
   * for each incremental ``token`` event; ``onDone`` is called when the
   * stream completes with the full processed response and citations array.
   * ``onError`` is called on transport or parse failures.
   *
   * Returns the AbortController so the caller can cancel mid-stream.
   */
  sendMessageStream: async (message, history, { onToken, onDone, onError }) => {
    const previous_questions = [];
    const previous_responses = [];
    let pendingQuestion = null;

    (history || []).forEach((m) => {
      if (m.sender === 'user' && m.text) {
        pendingQuestion = m.text;
        previous_questions.push(m.text);
      } else if (m.sender === 'bot' && m.text && pendingQuestion) {
        previous_responses.push(m.text);
        pendingQuestion = null;
      }
    });

    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();

    try {
      const response = await fetch(resolveLlmApiUrl() + '/stream', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          message,
          previous_questions: previous_questions.slice(-3),
          previous_responses: previous_responses.slice(-3),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const parseSSEChunk = (text) => {
        // text may contain one or more complete SSE events.
        // We split on double-newline and parse each event block.
        const events = text.split(/\n\n/);

        // Return parsed events and the leftover (incomplete) buffer.
        const parsed = [];
        for (const block of events) {
          if (!block.trim()) continue;
          const lines = block.split('\n');
          let eventType = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            } else if (line.startsWith('data:')) {
              dataStr = line.slice(5);
            }
          }
          if (eventType && dataStr) {
            try {
              parsed.push({ event: eventType, data: JSON.parse(dataStr) });
            } catch {
              // Malformed JSON — skip this event.
            }
          }
        }
        return parsed;
      };

      // Read loop.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Extract complete events from the buffer.
        const lastDoubleNewline = buffer.lastIndexOf('\n\n');
        if (lastDoubleNewline === -1) continue;

        const complete = buffer.slice(0, lastDoubleNewline + 2);
        buffer = buffer.slice(lastDoubleNewline + 2);

        const parsedEvents = parseSSEChunk(complete);
        for (const evt of parsedEvents) {
          if (evt.event === 'token') {
            onToken?.(evt.data.content || '');
          } else if (evt.event === 'done') {
            onDone?.({
              content: evt.data.content || '',
              citations: evt.data.citations || [],
            });
            return;
          } else if (evt.event === 'error') {
            onError?.(evt.data.message || 'Unknown error');
            return;
          }
        }
      }

      // Process any remaining buffer after the loop.
      if (buffer.trim()) {
        const remainder = parseSSEChunk(buffer + '\n\n');
        for (const evt of remainder) {
          if (evt.event === 'token') {
            onToken?.(evt.data.content || '');
          } else if (evt.event === 'done') {
            onDone?.({
              content: evt.data.content || '',
              citations: evt.data.citations || [],
            });
            return;
          } else if (evt.event === 'error') {
            onError?.(evt.data.message || 'Unknown error');
            return;
          }
        }
      }

      // If we got here without a done/error event, treat as error.
      onError?.('Stream ended unexpectedly');
    } catch (error) {
      if (error.name === 'AbortError') {
        // Caller aborted — not an error.
        return;
      }
      onError?.(error.message || 'Connection failed');
    }

    return controller;
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
