import { defineConfig, devices } from '@playwright/test';

const e2eBaseURL = process.env.PLAYWRIGHT_BASE_URL
  ?? (process.env.CI ? 'http://localhost:3000' : 'http://localhost:3100');

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  timeout:    30_000,
  retries:    process.env.CI ? 2 : 0,
  workers:    1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL:       e2eBaseURL,
    trace:         'on-first-retry',
    screenshot:    'only-on-failure',
    video:         'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Start dev server automatically when not in CI
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev -- --port 3100',
        url:     e2eBaseURL,
        env: {
          ...process.env,
          E2E_PLAYWRIGHT: '1',
          BETTER_AUTH_URL: e2eBaseURL,
          NEXT_PUBLIC_APP_URL: e2eBaseURL,
          AUTH_IP_RATE_LIMIT: process.env.AUTH_IP_RATE_LIMIT ?? '300',
          AUTH_ACCOUNT_RATE_LIMIT: process.env.AUTH_ACCOUNT_RATE_LIMIT ?? '100',
          SENTRY_DEBUG: 'false',
          ...(process.env.E2E_DATABASE_URL ? { DATABASE_URL: process.env.E2E_DATABASE_URL } : {}),
        },
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
