import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'tests/integration/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: { '@': projectRoot },
  },
});
