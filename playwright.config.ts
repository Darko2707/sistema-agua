import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout:    30_000,
  retries:    process.env.CI ? 2 : 0,
  workers:    1,
  reporter:   process.env.CI ? 'github' : 'list',
  use: {
    baseURL:       process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
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
        command: 'npm run dev',
        url:     'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
