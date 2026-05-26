// @vitest-environment node
import { describe, test, expect } from 'vitest'
import config from './vite.config.js'

describe('vite dev server proxy', () => {
  test('proxies /avatars to backend', () => {
    expect(config.server.proxy['/avatars']).toBeDefined()
    expect(config.server.proxy['/avatars'].target).toBe('http://backend:8080')
    expect(config.server.proxy['/avatars'].changeOrigin).toBe(true)
  })
})
