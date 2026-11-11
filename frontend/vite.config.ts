import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@flightwatcher/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Long inspire NDJSON streams — don't kill / buffer the pipe.
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const ct = String(proxyRes.headers['content-type'] || '')
            if (ct.includes('ndjson') || ct.includes('stream')) {
              res.setHeader('X-Accel-Buffering', 'no')
              res.setHeader('Cache-Control', 'no-cache')
              // Flush headers so chunks reach the browser as providers finish.
              if (typeof (res as { flushHeaders?: () => void }).flushHeaders === 'function') {
                ;(res as { flushHeaders: () => void }).flushHeaders()
              }
            }
          })
        },
      },
    },
    fs: {
      allow: ['..'],
    },
  },
})
