import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://ibbackend-production-9f382980.up.railway.app',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})