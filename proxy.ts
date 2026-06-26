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

function pickLimiter(pathname: string): Ratelimit | null {
  if (pathname.startsWith('/api/auth/'))       return authLimiter;
  if (pathname === '/api/mercadopago/checkout') return checkoutLimiter;
  if (pathname.startsWith('/api/trpc/'))       return trpcLimiter;
  return null;
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Keep 'unsafe-inline' for style-src: Radix UI uses inline style="" attributes for popover/tooltip positioning
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.mercadopago.com",
    "frame-src https://www.mercadopago.com.mx https://www.mercadopago.com https://www.mercadolibre.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Rate limiting for specific API routes (returns early — no nonce needed for JSON responses)
  const limiter = pickLimiter(pathname);
  if (limiter) {
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

  // CSP nonce for page routes (the page route matcher excludes API and static paths)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // API routes that need rate limiting
    '/api/auth/:path*',
    '/api/trpc/:path*',
    '/api/mercadopago/checkout',
    // Page routes that need CSP nonce (excludes prefetches, static assets, images, favicon)
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
