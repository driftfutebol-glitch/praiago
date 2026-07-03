import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,              // escuta em 0.0.0.0 pra o emulador alcançar via 10.0.2.2
    allowedHosts: true,      // aceita o Host do emulador (10.0.2.2)
    proxy: {
      '/api/ai': {
        target: 'https://api.blackbox.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, '')
      },
      // Posição aproximada por IP quando o aparelho não tem GPS (dev/web)
      '/api/ip': {
        target: 'https://ipwho.is',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ip/, '')
      }
    }
  },
  build: { outDir: 'dist' },
})
