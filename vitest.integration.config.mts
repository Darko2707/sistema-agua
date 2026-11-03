import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { getValidatedTestDatabaseUrl } from './tests/integration/database-env';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Load and validate the test-only URL in the runner before it creates worker
// processes. The setup file repeats the guard inside each worker before db import.
getValidatedTestDatabaseUrl();

export default defineConfig({
  // Integration tests load only .env.test through database-env.ts.
  envDir: false,
  test: {
    environment: 'node',
    setupFiles: ['tests/integration/setup.ts'],
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run sequentially because each test mutates shared database fixtures.
    pool: 'forks',
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': projectRoot,
      'server-only': fileURLToPath(new URL('./tests/integration/server-only.ts', import.meta.url)),
    },
  },
});
