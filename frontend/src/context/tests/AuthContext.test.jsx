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
