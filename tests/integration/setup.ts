// Runs before test modules import @/db. The shared guard loads only .env.test,
// rejects application database identities, then points the Neon pool at tests.
import { beforeAll } from 'vitest';
import { configureTestDatabase } from './database-env';

configureTestDatabase();

beforeAll(async () => {
  // Open the app's Neon pool against the validated test URL before fixtures run.
  const [{ db }, { sql }] = await Promise.all([
    import('../../db'),
    import('drizzle-orm'),
  ]);
  await db.execute(sql`select 1`);
}, 15_000);
