import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/subpath',
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8198', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'uv run uvicorn tests.subpath_server:app --host 127.0.0.1 --port 8198 --log-level warning',
    cwd: '../../services/api',
    url: 'http://127.0.0.1:8198/openmic/api/health',
    reuseExistingServer: false,
    env: {
      DATABASE_URL: `sqlite+aiosqlite:///${process.env.TMPDIR || '/home/ubuntu/.hermes/cache/scratch'}/openmic-subpath-e2e.db`,
      ADMIN_PASSWORD: 'e2e-admin-password',
      SECRET_KEY: 'e2e-secret-key-e2e-secret-key-e2e-secret-key',
      SEARCH_PROVIDER: 'mock',
      PUBLIC_BASE_URL: '',
      WEB_DIST_DIR: '../../apps/web/build',
      LOG_LEVEL: 'WARNING'
    }
  }
});
