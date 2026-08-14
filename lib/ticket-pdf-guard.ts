import { acquireConcurrencyLease } from '@/lib/concurrency-guard';
import { ticketAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { opaqueRateLimitKey } from '@/lib/request-security';

type TicketGuard =
  | { allowed: false; response: Response }
  | { allowed: true; release: () => Promise<void> };

export async function guardTicketPdf(accountId: string): Promise<TicketGuard> {
  const decision = await consumeRateLimit({
    limiter: ticketAccountLimiter,
    key: opaqueRateLimitKey('account', accountId),
    boundary: 'ticket_pdf_route',
    scope: 'ticket_pdf_account',
  });
  if (decision && !decision.success) {
    return { allowed: false, response: rateLimitResponse(decision) };
  }

  const lease = await acquireConcurrencyLease({
    scope: 'ticket-pdf-account',
    accountId,
    maxConcurrent: 2,
    ttlMs: 2 * 60 * 1000,
    boundary: 'ticket_pdf_route',
  });
  if (!lease.acquired) {
    return {
      allowed: false,
      response: new Response('Ya hay recibos en proceso', {
        status: 429,
        headers: {
          'Retry-After': '2',
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
    };
  }
  return { allowed: true, release: lease.release };
}
