import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const defaultApiProxyTarget = 'http://localhost:8080'

export default defineConfig(({ mode }) => {
  const { DEV_API_PROXY_TARGET = defaultApiProxyTarget } = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: DEV_API_PROXY_TARGET,
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest, request) => {
              const origin = request.headers.origin
              const host = request.headers.host
              if (host && (origin === `http://${host}` || origin === `https://${host}`)) {
                proxyRequest.removeHeader('origin')
              }
            })
          },
        }
      }
    }
  }
})