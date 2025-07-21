import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow connections from network
    port: 5173, // Default vite port
    proxy: {
      // Proxy API requests to the backend service
      '/api': {
        target: 'http://46.137.74.122',
        changeOrigin: true,
        secure: false,
      },
      // Proxy LLM service requests
      '/api/chat': {
        target: 'http://46.137.74.122:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
