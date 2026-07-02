import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    strictPort: true,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api/ai': {
        target: 'https://api.blackbox.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '')
      }
    }
  },
  build: { outDir: 'dist' },
})
