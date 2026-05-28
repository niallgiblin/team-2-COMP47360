import { vi } from 'vitest';
import React, { useContext } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../AuthContext';
import { BusynessProvider } from '../BusynessContext';
import * as invalidateModule from '../../cache/invalidateClientCaches';

const mockNavigate = vi.fn();
const invalidateClientCachesSpy = vi.spyOn(invalidateModule, 'invalidateClientCaches');

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../services/apiService', () => ({
  authFetch: vi.fn(),
  vibeAPI: {
    mapDataUrl: () => '/api/vibe/map-data',
    trendingUrl: () => '/api/vibe/trending',
  },
}));

// Mock localStorage with a store object
let store = {};
let sessionStore = {};

beforeAll(() => {
  store = {};
  sessionStore = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    },
    writable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: vi.fn((key) => sessionStore[key] || null),
      setItem: vi.fn((key, value) => {
        sessionStore[key] = value.toString();
      }),
      removeItem: vi.fn((key) => {
        delete sessionStore[key];
      }),
      clear: vi.fn(() => {
        sessionStore = {};
      }),
    },
    writable: true,
  });
});

// Global fetch mock
global.fetch = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.clearAllMocks();
  fetch.mockReset();
  invalidateClientCachesSpy.mockClear();

  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
});

// Test helper component to access auth context
const TestComponent = ({ action }) => {
  const auth = useContext(AuthContext);

  React.useEffect(() => {
    if (action) {
      (async () => {
        await action(auth);
      })();
    }
  }, [auth, action]);

  return <div>Test Component</div>;
};

describe('AuthContext', () => {
  test('makeAuthenticatedRequest 401 clears localStorage and sets isAuthenticated false (D-17, D-20)', async () => {
    // Seed localStorage with existing session
    store['token'] = 'valid-token'
    store['user'] = JSON.stringify({ id: 1, name: 'Test' })

    let capturedAuth
    const action = (auth) => { capturedAuth = auth }

    render(
      <AuthProvider>
        <TestComponent action={action} />
      </AuthProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Stub a 401 response
    fetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({}),
    })

    // Call makeAuthenticatedRequest and expect it to throw + clear auth
    await act(async () => {
      try {
        await capturedAuth.makeAuthenticatedRequest('/api/plans')
      } catch (_) {
        // Expected throw on 401
      }
    })

    // Auth state cleared from localStorage (D-20)
    expect(store['token']).toBeUndefined()
    expect(store['user']).toBeUndefined()

    // isAuthenticated is false
    await waitFor(() => {
      expect(capturedAuth.isAuthenticated).toBe(false)
    })

    expect(invalidateClientCachesSpy).toHaveBeenCalledTimes(1)
  })

  test('logout invokes invalidateClientCaches before navigating to login (D-10)', async () => {
    store['token'] = 'valid-token'
    store['user'] = JSON.stringify({ id: 1, name: 'Test' })

    let capturedAuth
    const action = (auth) => { capturedAuth = auth }

    render(
      <AuthProvider>
        <TestComponent action={action} />
      </AuthProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    await act(async () => {
      capturedAuth.logout()
    })

    expect(invalidateClientCachesSpy).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  test('logout with BusynessProvider clears venueBusynessCache_v3 from sessionStorage (D-10)', async () => {
    store['token'] = 'valid-token'
    store['user'] = JSON.stringify({ id: 1, name: 'Test' })
    sessionStore['venueBusynessCache_v3'] = JSON.stringify({
      busynessData: [],
      predictionData: [{ hour: 1 }],
      venueData: [],
      lastFetchTime: Date.now(),
    })

    let capturedAuth
    const action = (auth) => { capturedAuth = auth }

    render(
      <AuthProvider>
        <BusynessProvider>
          <TestComponent action={action} />
        </BusynessProvider>
      </AuthProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    await act(async () => {
      capturedAuth.logout()
    })

    expect(invalidateClientCachesSpy).toHaveBeenCalledTimes(1)
    expect(sessionStore['venueBusynessCache_v3']).toBeUndefined()
  })

  test('login sets user, token, and localStorage', async () => {
    const fakeUser = { id: 1, name: 'Test' };
    const fakeToken = 'abc123';

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: fakeUser, token: fakeToken }),
    });

    let capturedAuth;

    const action = (auth) => {
      capturedAuth = auth;
    };

    render(
      <AuthProvider>
        <TestComponent action={action} />
      </AuthProvider>
    );

    // Wait for initial useEffect in TestComponent to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Call login and check result
    await act(async () => {
      const result = await capturedAuth.login('email@test.com', 'pass');
      expect(result.success).toBe(true);
    });

    // Check localStorage state
    expect(store.token).toBe(fakeToken);
    expect(store.user).toBe(JSON.stringify(fakeUser));

    await waitFor(() => {
      expect(capturedAuth.isAuthenticated).toBe(true);
    });

    // Check navigation called with '/'
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
