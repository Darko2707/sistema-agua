import { db } from '@/db';
import { sql } from 'drizzle-orm';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'REPRESENTATIVE_RESET_CODE_SECRET',
  'MP_WEBHOOK_SECRET',
  'MP_ENCRYPTION_KEY',
  'CRON_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;

type CheckResult = { status: 'ok' | 'error'; latencyMs?: number; detail?: string };

async function checkDatabase(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch {
    return { status: 'error', latencyMs: Date.now() - t0, detail: 'unreachable' };
  }
}

function checkEnv(): CheckResult & { missingCount: number } {
  const missingCount = REQUIRED_ENV.filter((key) => !process.env[key]?.trim()).length
    + (process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() ? 0 : 1);
  return missingCount === 0
    ? { status: 'ok', missingCount: 0 }
    : { status: 'error', missingCount, detail: 'missing required env vars' };
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
