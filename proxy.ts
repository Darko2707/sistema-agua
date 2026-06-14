import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const rutas = ['/admin', '/representante', '/trabajador', '/residente']

export function proxy(req: NextRequest) {
  const session = getSessionCookie(req)
  const protegida = rutas.some(r => req.nextUrl.pathname.startsWith(r))
  if (protegida && !session)
    return NextResponse.redirect(new URL('/login', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] }