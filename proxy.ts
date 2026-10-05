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
  if (
    pathname === '/api/mercadopago/checkout'
    || pathname === '/api/mercadopago/servicios/checkout'
    || pathname === '/api/mercadopago/return'
  ) {
    return { limiter: checkoutLimiter, scope: 'checkout' };
  }
  if (
    pathname === '/api/tickets'
    || pathname.startsWith('/api/tickets/')
    || pathname === '/verificar'
    || pathname.startsWith('/verificar/')
  ) {
    return { limiter: ticketLimiter, scope: 'tickets' };
  }
  if (pathname === '/api/reportes' || pathname.startsWith('/api/reportes/')) {
    return { limiter: reportIpLimiter, scope: 'reports' };
  }
  return null;
}

function maintenanceEnabled(): boolean {
  return process.env.MAINTENANCE_MODE?.trim().toLowerCase() === 'true';
}

function isMaintenanceBypass(pathname: string): boolean {
  return pathname === '/mantenimiento'
    || pathname === '/api/health'
    || pathname === '/api/mercadopago/webhook'
    || pathname === '/api/cron'
    || pathname.startsWith('/api/cron/');
}

function maintenanceResponse(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;
  if (!maintenanceEnabled() || isMaintenanceBypass(pathname)) return null;

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Servicio temporalmente en mantenimiento' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'Retry-After': '300',
        },
      },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = '/mantenimiento';
  url.search = '';
  return NextResponse.redirect(url, 307);
}

export async function proxy(req: NextRequest) {
  const unavailable = maintenanceResponse(req);
  if (unavailable) return unavailable;

  const selected = pickLimiter(req.nextUrl.pathname);
  if (!selected) return NextResponse.next();

  const ip = clientIpFromHeaders(req.headers);
  const decision = await consumeRateLimit({
    limiter: selected.limiter,
    key: opaqueRateLimitKey('ip', ip),
    boundary: 'proxy',
    scope: selected.scope,
    failOpen: selected.scope !== 'auth' && selected.scope !== 'checkout',
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
  // Se evalúan las rutas dinámicas para poder activar mantenimiento sin un
  // despliegue adicional. Los assets estáticos nunca atraviesan el Proxy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icons/).*)'],
};
