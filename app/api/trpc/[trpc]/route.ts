import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { acquireConcurrencyLease } from '@/lib/concurrency-guard';
import {
  reportAccountLimiter,
  trpcAccountLimiter,
  trpcIpLimiter,
  ticketLimiter,
} from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { readBodyCloneWithLimit } from '@/lib/request-body-limit';
import { clientIpFromHeaders, opaqueRateLimitKey } from '@/lib/request-security';
import { TRPC_MAX_BATCH_SIZE } from '@/lib/traffic-limits';
import { appRouter } from '@/server/routers';
import { createTRPCContext } from '@/server/trpc';

export const dynamic = 'force-dynamic';
const MAX_TRPC_BODY_BYTES = 256 * 1024;

function configuredAccountConcurrency(): number {
  const parsed = Number(process.env.TRPC_MAX_CONCURRENT_REQUESTS);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 4;
}

function configuredIpConcurrency(): number {
  const parsed = Number(process.env.TRPC_MAX_CONCURRENT_IP_REQUESTS);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 8;
}

function concurrentResponse(): Response {
  return new Response('Too Many Concurrent Requests', {
    status: 429,
    headers: {
      'Retry-After': '1',
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function requestProcedures(request: Request): string[] {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/trpc/')) return [];
  try {
    return decodeURIComponent(pathname.slice('/api/trpc/'.length)).split(',');
  } catch {
    return [];
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === 'POST') {
    const bodyRead = await readBodyCloneWithLimit(req, MAX_TRPC_BODY_BYTES);
    if (bodyRead.status === 'too_large') {
      return new Response('Payload Too Large', {
        status: 413,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
    if (bodyRead.status === 'unreadable') {
      return new Response('Invalid Request Body', {
        status: 400,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  }

  const clientIp = clientIpFromHeaders(req.headers);
  const ipKey = opaqueRateLimitKey('ip', clientIp);
  const procedures = requestProcedures(req);

  if (procedures.includes('tickets.verificar')) {
    const ticketDecision = await consumeRateLimit({
      limiter: ticketLimiter,
      key: ipKey,
      boundary: 'trpc_route',
      scope: 'tickets_public',
    });
    if (ticketDecision && !ticketDecision.success) return rateLimitResponse(ticketDecision);
  }

  const ipDecision = await consumeRateLimit({
    limiter: trpcIpLimiter,
    key: ipKey,
    boundary: 'trpc_route',
    scope: 'trpc_ip',
  });
  if (ipDecision && !ipDecision.success) return rateLimitResponse(ipDecision);

  const ipLease = await acquireConcurrencyLease({
    scope: 'trpc-ip',
    accountId: ipKey,
    maxConcurrent: configuredIpConcurrency(),
    ttlMs: 60_000,
    boundary: 'trpc_route',
  });
  if (!ipLease.acquired) return concurrentResponse();

  try {
    const context = await createTRPCContext({ headers: req.headers });
    if (context.user) {
      const accountDecision = await consumeRateLimit({
        limiter: trpcAccountLimiter,
        key: opaqueRateLimitKey('account', context.user.id),
        boundary: 'trpc_route',
        scope: 'trpc_account',
      });
      if (accountDecision && !accountDecision.success) return rateLimitResponse(accountDecision);
    }

    const accountLease = context.user
      ? await acquireConcurrencyLease({
          scope: 'trpc-account',
          accountId: context.user.id,
          maxConcurrent: configuredAccountConcurrency(),
          ttlMs: 60_000,
          boundary: 'trpc_route',
        })
      : { acquired: true, release: async () => undefined };

    if (!accountLease.acquired) return concurrentResponse();

    try {
      const isFullExport = procedures.includes('operacion.exportacionCompleta');
      if (isFullExport && context.user) {
        const exportDecision = await consumeRateLimit({
          limiter: reportAccountLimiter,
          key: opaqueRateLimitKey('account', context.user.id),
          boundary: 'trpc_route',
          scope: 'full_export_account',
        });
        if (exportDecision && !exportDecision.success) return rateLimitResponse(exportDecision);
      }

      const exportLease = isFullExport && context.user
        ? await acquireConcurrencyLease({
            scope: 'full-export-account',
            accountId: context.user.id,
            maxConcurrent: 1,
            ttlMs: 3 * 60 * 1000,
            boundary: 'trpc_route',
          })
        : { acquired: true, release: async () => undefined };
      if (!exportLease.acquired) return concurrentResponse();

      try {
        return await fetchRequestHandler({
          endpoint: '/api/trpc',
          req,
          router: appRouter,
          createContext: () => context,
          maxBatchSize: TRPC_MAX_BATCH_SIZE,
        });
      } finally {
        await exportLease.release();
      }
    } finally {
      await accountLease.release();
    }
  } finally {
    await ipLease.release();
  }
}

export { handler as GET, handler as POST };
