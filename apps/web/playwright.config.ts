import { defineConfig, devices } from '@playwright/test';

const PORT = 8800;

/**
 * End-to-end tests run the real FastAPI backend (SQLite, mock YouTube search) serving the built
 * web app, and drive TV + phone screens in Chromium. The TV uses the demo player (?player=fake).
 * Run `npm run build` first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: `rm -f e2e.db e2e.db-wal e2e.db-shm && uv run uvicorn app.asgi:app --port ${PORT} --log-level warning`,
    cwd: '../../services/api',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: 'sqlite+aiosqlite:///./e2e.db',
      ADMIN_PASSWORD: 'e2e-admin-password',
      SECRET_KEY: 'e2e-secret-key-e2e-secret-key-e2e-secret-key',
      SEARCH_PROVIDER: 'mock',
      WEB_DIST_DIR: '../../apps/web/build',
      LOG_LEVEL: 'WARNING'
    }
  }
});
