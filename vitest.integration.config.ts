import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Integration tests must never inherit .env.local (or any other Vite env file).
  // TEST_DATABASE_URL has to be supplied explicitly by the shell or CI.
  envDir: false,
  test: {
    environment: 'node',
    setupFiles:  ['tests/integration/setup.ts'],
    include:     ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run sequentially — each test mutates shared DB fixtures
    pool:            'forks',
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
