import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import {
  resolveApiBaseUrl,
  joinApiPath,
  resolveLlmApiUrl,
  resolveAvatarUrl,
} from '../apiUrls'

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveApiBaseUrl', () => {
  test('returns /api when VITE_API_BASE_URL is unset', () => {
    expect(resolveApiBaseUrl()).toBe('/api')
  })

  test('strips trailing slash from configured value', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api/')
    expect(resolveApiBaseUrl()).toBe('/api')
  })

  test('returns configured value unchanged when no trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/staging-api')
    expect(resolveApiBaseUrl()).toBe('/staging-api')
  })
})

describe('resolveLlmApiUrl', () => {
  test('returns /api/chat when VITE_LLM_API_URL is unset', () => {
    expect(resolveLlmApiUrl()).toBe('/api/chat')
  })

  test('returns configured LLM URL', () => {
    vi.stubEnv('VITE_LLM_API_URL', '/llm/v1/chat')
    expect(resolveLlmApiUrl()).toBe('/llm/v1/chat')
  })
})

describe('joinApiPath', () => {
  test('joins base and path with leading slash', () => {
    expect(joinApiPath('/api', '/vibe/search')).toBe('/api/vibe/search')
  })

  test('prepends slash to path without one', () => {
    expect(joinApiPath('/api', 'plans/share')).toBe('/api/plans/share')
  })

  test('no double slash when base has no trailing slash and path has leading slash', () => {
    expect(joinApiPath('/api', '/auth/login')).toBe('/api/auth/login')
  })
})

describe('resolveAvatarUrl', () => {
  test('returns null for null input', () => {
    expect(resolveAvatarUrl(null)).toBeNull()
  })

  test('returns unchanged relative path starting with slash', () => {
    expect(resolveAvatarUrl('/avatars/u1.png')).toBe('/avatars/u1.png')
  })

  test('passes absolute http URL through unchanged', () => {
    expect(resolveAvatarUrl('https://cdn.example.com/avatar.jpg')).toBe(
      'https://cdn.example.com/avatar.jpg'
    )
  })

  test('prefixes bare filename with /avatars/', () => {
    expect(resolveAvatarUrl('profile.png')).toBe('/avatars/profile.png')
  })
})
