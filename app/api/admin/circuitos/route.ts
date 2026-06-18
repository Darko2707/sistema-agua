import { headers } from 'next/headers';

import { db } from '@/db';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });

  return usuario?.role === 'admin' ? usuario : null;
}

function maskToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const data = await db.query.circuitos.findMany({
    with: { representante: true },
    orderBy: (c, { asc }) => [asc(c.nombre)],
  });

  return Response.json({
    circuitos: data.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      representanteId: c.representanteId,
      representante: c.representante
        ? { id: c.representante.id, name: c.representante.name, email: c.representante.email }
        : null,
      montoMensual: c.montoMensual,
      mercadoPagoAccessToken: maskToken(c.mercadoPagoAccessToken),
      mercadoPagoCollectorId: c.mercadoPagoCollectorId,
    })),
  });
}
