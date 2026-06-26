import { db } from '@/db';
import { sql } from 'drizzle-orm';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'MP_WEBHOOK_SECRET',
  'MP_ENCRYPTION_KEY',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

type CheckResult = { status: 'ok' | 'error'; latencyMs?: number; detail?: string };

async function checkDatabase(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t0, detail: 'unreachable' };
  }
}

function checkEnv(): CheckResult & { missing: string[] } {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  return missing.length === 0
    ? { status: 'ok', missing: [] }
    : { status: 'error', missing, detail: 'missing required env vars' };
}

export async function GET() {
  const [database, env] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnv()),
  ]);

  const status = database.status === 'ok' && env.status === 'ok' ? 'ok' : 'degraded';

  return Response.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: { database, env },
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
