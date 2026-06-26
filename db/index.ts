import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Non-transactional queries (select, insert, update outside a transaction) use HTTP
// instead of WebSocket. HTTP is faster for cold starts: no WebSocket handshake.
// Transactions (db.transaction()) still use WebSocket automatically.
// fetchConnectionCache is true by default — HTTP connections are reused on warm starts.
neonConfig.poolQueryViaFetch = true;

// Pool connections are only consumed by transactions (poolQueryViaFetch routes
// everything else over HTTP). max:1 keeps one WebSocket ready per function instance
// without exhausting Neon's connection limit across concurrent Vercel invocations.
//
// ACTION REQUIRED: set DATABASE_URL to the Neon pooler URL (host ends in -pooler.neon.tech)
// so server-side PgBouncer handles DB connection reuse. Keep the direct URL only in
// DIRECT_URL for drizzle-kit migrations (drizzle.config.ts reads DIRECT_URL or DATABASE_URL).
const pool = new Pool({
  connectionString:        process.env.DATABASE_URL!,
  max:                     1,
  idleTimeoutMillis:   10_000,  // release idle WebSocket connections after 10s
  connectionTimeoutMillis: 5_000,  // fail fast if Neon is unreachable
});

export const db = drizzle(pool, { schema });
