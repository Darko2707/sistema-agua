import { defineConfig } from 'drizzle-kit';
import { configureTestDatabase } from './tests/integration/database-env';

const testDatabaseUrl = configureTestDatabase();

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: testDatabaseUrl,
  },
});