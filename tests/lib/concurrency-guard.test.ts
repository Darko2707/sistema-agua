import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock('@/lib/upstash', () => ({
  upstashRedis: { eval: mocks.eval },
  upstashNamespace: (scope: string) => `test:${scope}`,
}));
vi.mock('@/lib/operational-alert', () => ({
  reportOperationalFailure: mocks.reportFailure,
}));

import { acquireConcurrencyLease } from '@/lib/concurrency-guard';

describe('distributed concurrency guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = 'lease-test-secret';
  });

  it('adquiere y libera atomicamente sin exponer el account id', async () => {
    mocks.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const lease = await acquireConcurrencyLease({
      scope: 'report',
      accountId: 'resident-sensitive-id',
      maxConcurrent: 1,
      ttlMs: 60_000,
      boundary: 'test',
    });
    expect(lease.acquired).toBe(true);
    const firstCall = mocks.eval.mock.calls[0];
    expect(firstCall[0]).toContain('ZREMRANGEBYSCORE');
    expect(JSON.stringify(firstCall)).not.toContain('resident-sensitive-id');

    await lease.release();
    await lease.release();
    expect(mocks.eval).toHaveBeenCalledTimes(2);
    expect(mocks.eval.mock.calls[1][0]).toContain('ZREM');
  });

  it('rechaza cuando el semaforo ya alcanzo el maximo', async () => {
    mocks.eval.mockResolvedValueOnce(0);
    const lease = await acquireConcurrencyLease({
      scope: 'report',
      accountId: 'account',
      maxConcurrent: 1,
      ttlMs: 60_000,
      boundary: 'test',
    });
    expect(lease.acquired).toBe(false);
  });

  it('falla abierto y agrupa telemetria si Upstash no responde', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('provider detail'));
    const lease = await acquireConcurrencyLease({
      scope: 'report',
      accountId: 'account',
      maxConcurrent: 1,
      ttlMs: 60_000,
      boundary: 'test',
    });
    expect(lease.acquired).toBe(true);
    expect(mocks.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      component: 'concurrency_guard',
      scope: 'report',
      failOpen: true,
    }));
  });
});
