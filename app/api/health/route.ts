import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { upstashRedis } from '@/lib/upstash';
import { logger } from '@/lib/logger';

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
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const detail = err instanceof Error ? err.message : 'unreachable';
    logger.error('health.database_unreachable', err, { latencyMs });
    return { status: 'error', latencyMs, detail };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { status: 'error', detail: 'missing configuration' };
  }
  if (!upstashRedis) {
    return { status: 'ok', detail: 'test environment bypassed' };
  }

  const t0 = Date.now();
  try {
    await Promise.race([
      upstashRedis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const detail = err instanceof Error ? err.message : 'unreachable';
    logger.error('health.redis_unreachable', err, { latencyMs });
    return { status: 'error', latencyMs, detail };
  }
}

function checkEnv(): CheckResult & { missingCount: number } {
  const missingCount = REQUIRED_ENV.filter((key) => !process.env[key]?.trim()).length
    + (process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() ? 0 : 1);
  return missingCount === 0
    ? { status: 'ok', missingCount: 0 }
    : { status: 'error', missingCount, detail: 'missing required env vars' };
}

function getMetrics() {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
  };
}

export async function GET() {
  const [database, env, redis] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnv()),
    checkRedis(),
  ]);

  const isHealthy = database.status === 'ok' && env.status === 'ok' && redis.status === 'ok';
  const isCriticalFailed = database.status !== 'ok' || env.status !== 'ok';
  const status = isHealthy ? 'ok' : isCriticalFailed ? 'unhealthy' : 'degraded';

  if (status !== 'ok') {
    logger.warn('health.system_unhealthy', { status, database, env, redis });
  }

  return Response.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: { database, env, redis },
      metrics: getMetrics(),
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
