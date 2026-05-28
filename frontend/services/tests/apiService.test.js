import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { authAPI, apiService, planAPI, vibeAPI, chatAPI, joinApiPath, resolveApiBaseUrl } from '../apiService'

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
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('authAPI', () => {
  test('login calls correct relative endpoint and returns data', async () => {
    const fakeResponse = { token: 'abc123', user: { id: 1, name: 'Test User' } }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse
    })

    const result = await authAPI.login('test@example.com', 'password123')

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
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

  test('signup sends data to relative endpoint and returns result', async () => {
    const signupData = { username: 'newuser', email: 'user@example.com', password: 'pass' }
    const fakeResponse = { success: true, userId: 5 }

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeResponse
    })

    const result = await authAPI.signup(signupData)

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/signup',
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

  test('getProfile returns user data from relative endpoint', async () => {
    const fakeUser = { id: 1, name: 'User One' }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeUser
    })

    const result = await authAPI.getProfile(1)

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/profile?userId=1',
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

  test('updateProfile updates user via relative endpoint', async () => {
    const userData = { id: 1, name: 'Updated User' }
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => userData
    })

    const result = await authAPI.updateProfile(1, userData)

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/profile/1',
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

describe('production-style relative routes', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    vi.stubEnv('VITE_LLM_API_URL', '/api/chat')
  })

  test('planAPI.getPlans calls /api/plans', async () => {
    const fakePlans = [{ id: 1, name: 'Weekend plan' }]
    fetch.mockResolvedValueOnce({ ok: true, json: async () => fakePlans })

    const result = await planAPI.getPlans()

    expect(fetch).toHaveBeenCalledWith(
      '/api/plans',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
    )
    expect(result).toEqual(fakePlans)
  })

  test('planAPI share path resolves to /api/plans/:id', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 42 }) })
    await planAPI.getPlanById(42)
    expect(fetch).toHaveBeenCalledWith('/api/plans/42', expect.anything())
  })

  test('favourites path resolves to /api/favourites via joinApiPath', () => {
    const base = resolveApiBaseUrl()
    expect(joinApiPath(base, '/favourites')).toBe('/api/favourites')
  })

  test('favourites toggle path resolves to /api/favourites/:id via joinApiPath', () => {
    const base = resolveApiBaseUrl()
    expect(joinApiPath(base, '/favourites/7')).toBe('/api/favourites/7')
  })

  test('vibeAPI.searchUrl resolves to /api/vibe/search', () => {
    expect(vibeAPI.searchUrl()).toBe('/api/vibe/search')
  })

  test('vibeAPI.mapDataUrl resolves to /api/vibe/map-data', () => {
    expect(vibeAPI.mapDataUrl()).toBe('/api/vibe/map-data')
  })

  test('vibeAPI.mapDataUrl with bbox appends query string', () => {
    const url = vibeAPI.mapDataUrl({
      minLat: 40.7,
      maxLat: 40.86,
      minLng: -74.05,
      maxLng: -73.92,
    })
    expect(url).toContain('minLat=')
    expect(url).toContain('maxLat=')
    expect(url).toContain('minLng=')
    expect(url).toContain('maxLng=')
    expect(url).toMatch(/\/api\/vibe\/map-data\?/)
  })

  test('vibeAPI.trendingUrl resolves to /api/vibe/trending', () => {
    expect(vibeAPI.trendingUrl()).toBe('/api/vibe/trending')
  })

  test('chatAPI.sendMessage POSTs to /api/chat with message in body (D-16)', async () => {
    const fakeReply = { response: 'Hello!' }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => fakeReply })

    const result = await chatAPI.sendMessage('find me jazz bars', [])

    expect(fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: expect.stringContaining('"message":"find me jazz bars"')
      })
    )
    expect(result).toEqual(fakeReply)
  })

  test('chatAPI.sendMessage sends Authorization header when token exists (D-01)', async () => {
    localStorage.setItem('token', 'chat_tok_abc')
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ok' }) })
    await chatAPI.sendMessage('hello', [])
    const callArgs = fetch.mock.calls[0][1]
    expect(callArgs.headers.Authorization).toBe('Bearer chat_tok_abc')
  })

  // D-05/D-24: Flask /api/chat uses previous_questions; completes Phase 2 D-16 deferral.
  test('chatAPI.sendMessage sends previous_questions not history', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ok' }) })

    await chatAPI.sendMessage('second question', [
      { text: 'first', sender: 'user' },
      { text: 'bot reply', sender: 'bot' },
    ])

    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.message).toBe('second question')
    expect(body.previous_questions).toEqual(['first'])
    expect(body).not.toHaveProperty('history')
    expect(JSON.stringify(body)).not.toContain('"history"')
  })

  test('chatAPI.sendMessage with empty history sends previous_questions []', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ok' }) })

    await chatAPI.sendMessage('first turn', [])

    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.previous_questions).toEqual([])
    expect(body).not.toHaveProperty('history')
    expect(JSON.stringify(body)).not.toContain('"history"')
  })

  test('chatAPI.sendMessage multi-turn extracts all user questions', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'ok' }) })

    await chatAPI.sendMessage('third', [
      { text: 'first', sender: 'user' },
      { text: 'reply', sender: 'bot' },
      { text: 'second', sender: 'user' },
    ])

    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.message).toBe('third')
    expect(body.previous_questions).toEqual(['first', 'second'])
    expect(body).not.toHaveProperty('history')
  })

  test('friends call with token asserts Authorization Bearer header', async () => {
    localStorage.setItem('token', 'tok_abc')
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ friends: [] }) })

    const { friendsAPI } = await import('../apiService')
    await friendsAPI.getFriendsList(1)

    const callArgs = fetch.mock.calls[0][1]
    expect(callArgs.headers['Authorization']).toBe('Bearer tok_abc')
  })
})
