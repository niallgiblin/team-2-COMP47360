// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',

    env: { unstubEnvs: true },

    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],

    maxThreads: 2,
    maxConcurrency: 2,
  },
})
