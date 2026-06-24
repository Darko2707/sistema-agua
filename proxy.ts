import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que requieren sesión activa
const PROTECTED_PREFIXES = [
  '/admin',
  '/representante',
  '/tesorera',
  '/trabajador', // Unificar: usar 'trabajador' en lugar de 'cuadrilla'
  '/residente',
];

// Rutas públicas (no requieren autenticación)
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/registro',
  '/reset-password',
  '/api/auth',
  '/api/trpc',
  '/api/cron',
  '/api/mercadopago/webhook', // Webhook de MP es público
];

// Cookie que Better Auth establece al autenticarse
const SESSION_COOKIE = 'better-auth.session-token';
const SECURE_SESSION_COOKIE = '__Secure-better-auth.session-token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verificar si es una ruta pública
  const isPublic = PUBLIC_PATHS.some(path => pathname.startsWith(path));
  if (isPublic) {
    return NextResponse.next();
  }

  // Verificar si la ruta está protegida
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  // Verificar cookie de sesión
  const sessionCookie =
    request.cookies.get(SESSION_COOKIE) ??
    request.cookies.get(SECURE_SESSION_COOKIE);

  // Si no hay sesión, redirigir a login
  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si el usuario ya tiene sesión y está en login o registro, redirigir
  if (pathname === '/login' || pathname === '/registro') {
    // Opcional: redirigir según rol (puedes hacerlo en el cliente)
    return NextResponse.next();
  }

  return NextResponse.next();
}

// Configuración del matcher - excluye archivos estáticos y API internas
export const config = {
  matcher: [
    '/admin/:path*',
    '/representante/:path*',
    '/tesorera/:path*',
    '/trabajador/:path*',
    '/residente/:path*',
    '/login',
    '/registro',
    '/reset-password',
    // Excluir archivos estáticos y API
    '/((?!api|_next|.*\\..*|favicon.ico).*)',
  ],
};