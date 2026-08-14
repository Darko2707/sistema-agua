import type { Ratelimit } from '@upstash/ratelimit';
import { NextRequest, NextResponse } from 'next/server';

import {
  authLimiter,
  checkoutLimiter,
  reportIpLimiter,
  ticketLimiter,
} from '@/lib/ratelimit';
import {
  consumeRateLimit,
  rateLimitHeaders,
  rateLimitResponse,
} from '@/lib/rate-limit-guard';
import { clientIpFromHeaders, opaqueRateLimitKey } from '@/lib/request-security';

// Only credential-bearing auth endpoints are included. get-session, callbacks
// and sign-out are intentionally excluded because clients call them frequently.
const AUTH_SENSITIVE = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/request-password-reset',
  '/api/auth/forget-password', // legacy Better Auth alias
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/change-email',
  '/api/auth/delete-user',
]);

type LimiterScope = 'auth' | 'checkout' | 'tickets' | 'reports';

type RouteLimiter = {
  limiter: Ratelimit | null;
  scope: LimiterScope;
};

function pickLimiter(pathname: string): RouteLimiter | null {
  if (AUTH_SENSITIVE.has(pathname)) {
    return { limiter: authLimiter, scope: 'auth' };
  }
  if (pathname === '/api/mercadopago/checkout') {
    return { limiter: checkoutLimiter, scope: 'checkout' };
  }
  if (pathname === '/verificar' || pathname.startsWith('/verificar/')) {
    return { limiter: ticketLimiter, scope: 'tickets' };
  }
  if (pathname === '/api/tickets' || pathname.startsWith('/api/tickets/')) {
    return { limiter: ticketLimiter, scope: 'tickets' };
  }
  if (pathname === '/api/reportes' || pathname.startsWith('/api/reportes/')) {
    return { limiter: reportIpLimiter, scope: 'reports' };
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const selected = pickLimiter(req.nextUrl.pathname);
  if (!selected) return NextResponse.next();

  const ip = clientIpFromHeaders(req.headers);
  const decision = await consumeRateLimit({
    limiter: selected.limiter,
    key: opaqueRateLimitKey('ip', ip),
    boundary: 'proxy',
    scope: selected.scope,
  });

  if (!decision) return NextResponse.next();
  if (!decision.success) return rateLimitResponse(decision);

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(rateLimitHeaders(decision))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    '/api/auth/sign-in/:path*',
    '/api/auth/sign-up/:path*',
    '/api/auth/request-password-reset',
    '/api/auth/forget-password',
    '/api/auth/reset-password',
    '/api/auth/change-password',
    '/api/auth/change-email',
    '/api/auth/delete-user',
    '/api/mercadopago/checkout',
    '/api/reportes/:path*',
    '/api/tickets/:path*',
    '/verificar/:path*',
  ],
};
