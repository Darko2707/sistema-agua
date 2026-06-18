import { headers } from 'next/headers';

import { db } from '@/db';
import { auth } from '@/lib/auth';

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });

  return usuario?.role === 'admin' ? usuario : null;
}

export function maskToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function unauthorized() {
  return Response.json({ error: 'No autorizado' }, { status: 401 });
}
