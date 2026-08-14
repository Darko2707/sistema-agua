import { acquireConcurrencyLease } from '@/lib/concurrency-guard';
import { reportAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { opaqueRateLimitKey } from '@/lib/request-security';

type ReportExportGuard =
  | { allowed: false; response: Response }
  | { allowed: true; release: () => Promise<void> };

function configuredConcurrency(): number {
  const parsed = Number(process.env.REPORT_MAX_CONCURRENT_EXPORTS);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 1;
}

export async function guardReportExport(accountId: string): Promise<ReportExportGuard> {
  const decision = await consumeRateLimit({
    limiter: reportAccountLimiter,
    key: opaqueRateLimitKey('account', accountId),
    boundary: 'report_route',
    scope: 'report_account',
  });
  if (decision && !decision.success) {
    return { allowed: false, response: rateLimitResponse(decision) };
  }

  const lease = await acquireConcurrencyLease({
    scope: 'report-export-account',
    accountId,
    maxConcurrent: configuredConcurrency(),
    ttlMs: 3 * 60 * 1000,
    boundary: 'report_route',
  });
  if (!lease.acquired) {
    return {
      allowed: false,
      response: new Response('Ya hay una exportacion en proceso', {
        status: 429,
        headers: {
          'Retry-After': '5',
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
    };
  }

  return { allowed: true, release: lease.release };
}
