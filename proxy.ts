import { NextRequest, NextResponse } from 'next/server';
import { authLimiter, trpcLimiter, checkoutLimiter } from '@/lib/ratelimit';
import type { Ratelimit } from '@upstash/ratelimit';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'anonymous'
  );
}

// Only rate-limit auth endpoints that accept credentials or trigger emails.
// get-session / sign-out / verify-email are called constantly by the client
// and must NOT be throttled — a 429 on get-session causes an infinite retry loop.
const AUTH_SENSITIVE = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/forget-password',
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/change-email',
  '/api/auth/delete-user',
]);

function pickLimiter(pathname: string): Ratelimit | null {
  if (AUTH_SENSITIVE.has(pathname))            return authLimiter;
  if (pathname === '/api/mercadopago/checkout') return checkoutLimiter;
  if (pathname.startsWith('/api/trpc/'))       return trpcLimiter;
  return null;
}

export async function proxy(req: NextRequest) {
  const limiter = pickLimiter(req.nextUrl.pathname);
  if (!limiter) return NextResponse.next();

  const { success, limit, remaining, reset } = await limiter.limit(getIp(req));
  const rlHeaders = {
    'X-RateLimit-Limit':     String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset':     String(reset),
  };

  if (!success) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        ...rlHeaders,
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'Content-Type': 'text/plain',
      },
    });
  }

  const res = NextResponse.next();
  Object.entries(rlHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: [
    '/api/auth/sign-in/:path*',
    '/api/auth/sign-up/:path*',
    '/api/auth/forget-password',
    '/api/auth/reset-password',
    '/api/auth/change-password',
    '/api/auth/change-email',
    '/api/auth/delete-user',
    '/api/trpc/:path*',
    '/api/mercadopago/checkout',
  ],
};
