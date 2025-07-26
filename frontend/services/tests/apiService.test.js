import { authAPI, apiService } from '../apiService'
import { vi, describe, test, expect, beforeEach } from 'vitest'

global.fetch = vi.fn()

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString()
    },
    removeItem: (key) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

describe('authAPI', () => {
  test('login calls correct endpoint and returns data', async () => {
    const fakeResponse = { token: 'abc123', user: { id: 1, name: 'Test User' } }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse
    })

    const result = await authAPI.login('test@example.com', 'password123')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          usernameOrEmail: 'test@example.com',
          password: 'password123'
        }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )

    expect(result).toEqual(fakeResponse)
  })

  test('signup sends data and returns result', async () => {
    const signupData = { username: 'newuser', email: 'user@example.com', password: 'pass' }
    const fakeResponse = { success: true, userId: 5 }

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse
    })

    const result = await authAPI.signup(signupData)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(signupData)
      })
    )
    expect(result).toEqual(fakeResponse)
  })

  test('throws error if login fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
      status: 401,
      statusText: 'Unauthorized'
    })

    await expect(authAPI.login('wronguser', 'badpass')).rejects.toThrow('Invalid credentials')
  })

  test('getProfile returns user data', async () => {
    const fakeUser = { id: 1, name: 'User One' }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeUser
    })

    const result = await authAPI.getProfile(1)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/profile?userId=1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )

    expect(result).toEqual(fakeUser)
  })

  test('getProfile throws error if not ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
      status: 401,
      statusText: 'Unauthorized'
    })

    await expect(authAPI.getProfile(1)).rejects.toThrow('Unauthorized')
  })

  test('updateProfile updates user and localStorage', async () => {
    const userData = { id: 1, name: 'Updated User' }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => userData
    })

    const result = await authAPI.updateProfile(1, userData)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/auth/profile/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(userData),
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    )

    expect(result).toEqual(userData)
  })

  test('updateProfile throws error if failed', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Bad request' }),
      status: 400,
      statusText: 'Bad Request'
    })

    await expect(authAPI.updateProfile(1, { name: 'fail' })).rejects.toThrow('Bad request')
  })
})

describe('apiService helpers', () => {
  test('isAuthenticated returns true if user and token exist', () => {
    localStorage.setItem('token', 'abc123')
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test User' }))

    expect(apiService.isAuthenticated()).toBe(true)
  })

  test('isAuthenticated returns false if no token or user', () => {
    expect(apiService.isAuthenticated()).toBe(false)
  })

  test('clearAuth removes token and user', () => {
    localStorage.setItem('token', 'abc123')
    localStorage.setItem('user', JSON.stringify({ name: 'User' }))

    apiService.clearAuth()

    expect(localStorage.getItem('token')).toBe(null)
    expect(localStorage.getItem('user')).toBe(null)
  })
})
