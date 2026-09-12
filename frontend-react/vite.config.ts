// defineConfig from vitest/config (not bare vite): the `test` key is typed
// here, without relying on a /// types reference that silently breaks when
// the package manager nests a second vite copy under vitest/ (bun does).
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // Deterministic API base for api.ts (never the real homelab backend)
    env: {
      VITE_API_URL: 'http://test.local/api/v1',
    },
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ is run by Playwright (real browser + real backend), not vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
