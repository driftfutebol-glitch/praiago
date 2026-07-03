import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { 
    port: 5176, 
    strictPort: true,
    proxy: {
      '/api/ai': {
        target: 'https://api.blackbox.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '')
      },
      '/api/geocode': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        headers: { 'User-Agent': 'PraiaGoDev/1.0' },
        rewrite: (path) => path.replace(/^\/api\/geocode/, '')
      }
    }
  },
  build: { outDir: 'dist' },
})
