import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reportLimit: vi.fn(),
  ticketLimit: vi.fn(),
  acquireLease: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  reportAccountLimiter: { limit: mocks.reportLimit },
  ticketAccountLimiter: { limit: mocks.ticketLimit },
}));
vi.mock('@/lib/concurrency-guard', () => ({
  acquireConcurrencyLease: mocks.acquireLease,
}));
vi.mock('@/lib/operational-alert', () => ({ reportOperationalFailure: vi.fn() }));

import { guardReportExport } from '@/lib/report-export-guard';
import { guardTicketPdf } from '@/lib/ticket-pdf-guard';

const decision = (success: boolean) => ({
  success,
  limit: 10,
  remaining: success ? 9 : 0,
  reset: Date.now() + 60_000,
});

describe('expensive resource guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = 'resource-guard-test-secret';
    mocks.reportLimit.mockResolvedValue(decision(true));
    mocks.ticketLimit.mockResolvedValue(decision(true));
    mocks.acquireLease.mockResolvedValue({ acquired: true, release: mocks.release });
  });

  it('serializa exportaciones por cuenta', async () => {
    const guard = await guardReportExport('user-1');
    expect(guard.allowed).toBe(true);
    expect(mocks.reportLimit).toHaveBeenCalledTimes(1);
    expect(mocks.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'report-export-account',
      accountId: 'user-1',
      maxConcurrent: 1,
    }));
  });

  it('rechaza exportacion antes del lease al agotar el bucket', async () => {
    mocks.reportLimit.mockResolvedValueOnce(decision(false));
    const guard = await guardReportExport('user-1');
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.response.status).toBe(429);
    expect(mocks.acquireLease).not.toHaveBeenCalled();
  });

  it('limita generacion PDF por cuenta y concurrencia', async () => {
    const guard = await guardTicketPdf('user-2');
    expect(guard.allowed).toBe(true);
    expect(mocks.ticketLimit).toHaveBeenCalledTimes(1);
    expect(mocks.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'ticket-pdf-account',
      accountId: 'user-2',
      maxConcurrent: 2,
    }));
  });

  it('devuelve 429 si ya hay demasiados PDFs concurrentes', async () => {
    mocks.acquireLease.mockResolvedValueOnce({ acquired: false, release: mocks.release });
    const guard = await guardTicketPdf('user-2');
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.response.status).toBe(429);
  });
});
