import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  redisPing: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    execute: mocks.execute,
  },
}));

vi.mock('@/lib/upstash', () => ({
  upstashRedis: {
    ping: mocks.redisPing,
  },
}));

import { GET } from '@/app/api/health/route';

describe('SCRUM-32: Health Check API (GET /api/health)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      BETTER_AUTH_SECRET: '01234567890123456789012345678901',
      REPRESENTATIVE_RESET_CODE_SECRET: '01234567890123456789012345678902',
      MP_WEBHOOK_SECRET: 'webhook-secret',
      MP_ENCRYPTION_KEY: '0123456789012345678901234567890101234567890123456789012345678901',
      CRON_SECRET: 'cron-secret',
      UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'vapid-pub',
      VAPID_PRIVATE_KEY: 'vapid-priv',
      VAPID_SUBJECT: 'mailto:admin@example.com',
      BETTER_AUTH_URL: 'http://localhost:3000',
    };
  });

  it('devuelve 200 OK y estado "ok" cuando todas las dependencias son saludables', async () => {
    mocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mocks.redisPing.mockResolvedValueOnce('PONG');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.checks.database.status).toBe('ok');
    expect(typeof data.checks.database.latencyMs).toBe('number');
    expect(data.checks.redis.status).toBe('ok');
    expect(data.checks.env.status).toBe('ok');
    expect(data.metrics).toBeDefined();
    expect(typeof data.metrics.uptimeSeconds).toBe('number');
    expect(typeof data.metrics.heapUsedMb).toBe('number');
  });

  it('devuelve 503 Service Unavailable y estado "unhealthy" cuando la base de datos falla', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('Connection refused'));
    mocks.redisPing.mockResolvedValueOnce('PONG');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.checks.database.status).toBe('error');
    expect(data.checks.database.detail).toBe('Connection refused');
  });

  it('devuelve 503 y estado "unhealthy" si faltan variables de entorno requeridas', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    mocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mocks.redisPing.mockResolvedValueOnce('PONG');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('unhealthy');
    expect(data.checks.env.status).toBe('error');
    expect(data.checks.env.missingCount).toBeGreaterThanOrEqual(2);
  });

  it('devuelve 503 y estado "degraded" cuando Redis no responde o arroja timeout', async () => {
    mocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mocks.redisPing.mockRejectedValueOnce(new Error('Upstash connection timeout'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.checks.database.status).toBe('ok');
    expect(data.checks.redis.status).toBe('error');
    expect(data.checks.redis.detail).toContain('Upstash connection timeout');
  });
});
