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
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Vendored shadcn/ui primitives are copied third-party code, not app
      // logic — exclude them so the number reflects code we own.
      exclude: ['**/*.test.*', 'src/test/**', 'src/components/ui/**'],
      // Guardrails: fail CI if coverage drops below these floors.
      // Set just under the current measured values to avoid brittleness.
      // Current (2026-09): stmts 84.56 / branch 70.25 / funcs 76.14 / lines 86.91.
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 70,
        lines: 80,
      },
    },
    // Deterministic API base for api.ts (never the real homelab backend)
    env: {
      VITE_API_URL: 'http://test.local/api/v1',
    },
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ is run by Playwright (real browser + real backend), not vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
