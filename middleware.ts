import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que requieren sesión activa
const PROTECTED_PREFIXES = [
  '/admin',
  '/representante',
  '/cuadrilla',
  '/residente',
];

// Cookie que Better Auth establece al autenticarse
const SESSION_COOKIE = 'better-auth.session_token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  // Verificación ligera por presencia de cookie (defensa en profundidad).
  // La validación real de la sesión ocurre en cada handler/procedure.
  const sessionCookie =
    request.cookies.get(SESSION_COOKIE) ??
    request.cookies.get('__Secure-' + SESSION_COOKIE);

  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/representante/:path*',
    '/cuadrilla/:path*',
    '/residente/:path*',
  ],
};
