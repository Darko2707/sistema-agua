import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const rutasProtegidas = ['/admin', '/representante', '/trabajador', '/residente'];

export function proxy(req: NextRequest) {
  // Obtener la sesión de la cookie
  const session = getSessionCookie(req);
  const path = req.nextUrl.pathname;

  // Verificar si la ruta actual es una de las protegidas
  const esProtegida = rutasProtegidas.some((r) => path.startsWith(r));

  // Si es protegida y no hay sesión, redirigir a login
  if (esProtegida && !session) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Si el usuario tiene sesión e intenta entrar a /login, redirigir a /residente
  return NextResponse.next();
}

// Configurar el matcher para que no aplique a archivos estáticos ni a la API
export const config = {
  matcher: ['/((?!api|_next|.*\\..*|favicon.ico).*)'],
};
