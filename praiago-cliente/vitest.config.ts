import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Admin UI contract tests share the Cliente harness; use one React dispatcher.
  resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'lucide-react', 'framer-motion'] },
  test: {
    // Cross-app UI tests must not load Admin's separate React through external packages.
    server: { deps: { inline: ['react-router-dom', 'react-router', 'lucide-react', 'framer-motion'] } },
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
})
