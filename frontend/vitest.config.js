// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',

    env: { unstubEnvs: true },

    include: ['**/*.{test,spec}.{js,jsx,ts,tsx}', 'vite.config.test.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      'vite.config.js',
    ],

    maxThreads: 2,
    maxConcurrency: 2,
  },
})
