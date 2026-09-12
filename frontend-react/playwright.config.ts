import { defineConfig } from '@playwright/test'

/**
 * Smoke tests in a REAL headless browser (system Chromium) against the real
 * stack: `vite preview` (production build → service worker active) + the real
 * FastAPI backend on SQLite (backend/dev_sqlite_server.py).
 *
 * Run: npm run test:e2e   (builds the frontend, boots the backend, then Chromium)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3056',
    // System Chromium (no bundled browser download needed).
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        'rm -f /tmp/vv-e2e.sqlite3 && cd ../backend && ' +
        'VV_SQLITE_DB=/tmp/vv-e2e.sqlite3 VV_PORT=18055 ' +
        'DB_HOST=x DB_USER=x DB_PASSWORD=x .venv/bin/python dev_sqlite_server.py',
      url: 'http://127.0.0.1:18055/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // VITE_API_URL is baked in at build time → build with it set.
      command:
        'VITE_API_URL=http://127.0.0.1:18055/api/v1 npm run build && ' +
        'npx vite preview --host 127.0.0.1 --port 3056 --strictPort',
      url: 'http://127.0.0.1:3056',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
})
