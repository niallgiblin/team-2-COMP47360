import { vi } from 'vitest';
import React, { useContext } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../AuthContext';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock localStorage with a store object
let store = {};

beforeAll(() => {
  store = {};
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
});

// Global fetch mock
global.fetch = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  fetch.mockReset();

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
