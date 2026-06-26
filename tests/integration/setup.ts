// Runs before every integration test file.
// MUST be the first thing that executes — before @/db is imported —
// so that DATABASE_URL and MP_ENCRYPTION_KEY are in process.env when
// the Neon Pool is constructed.
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });
