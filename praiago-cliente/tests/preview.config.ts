import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: /^(?:.*\/)?lib\/supabase(?:\.ts)?$/, replacement: resolve(import.meta.dirname, 'supabaseDouble.ts') }] },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
})
