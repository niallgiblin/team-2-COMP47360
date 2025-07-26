import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [
      react({
        jsxRuntime: 'automatic', // Enables new JSX transform, no React import needed
      }),
    ],

    define: {
      'process.env': {
        VITE_API_BASE_URL: JSON.stringify(env.VITE_API_BASE_URL || 'http://localhost:8080/api'),
      },
    },

    server: {
      host: true,
      port: 5173,

      proxy: {
        '/api': {
          target: 'http://46.137.74.122',
          changeOrigin: true,
          secure: false,
        },
        '/api/chat': {
          target: 'http://46.137.74.122:5001',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.js',
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
      maxThreads: 1,
      maxConcurrentTests: 1,
    },
  };
});
