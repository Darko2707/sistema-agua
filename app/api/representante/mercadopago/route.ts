import { headers } from 'next/headers';

import { db } from '@/db';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireRepresentante() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });

  return usuario?.role === 'representante' || usuario?.role === 'admin' ? usuario : null;
}

function maskToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 8) return '********';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function GET() {
  const usuario = await requireRepresentante();
  if (!usuario) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.representanteId, usuario.id),
  });

  if (!circuito) {
    return Response.json({ circuito: null }, { status: 404 });
  }

  return Response.json({
    circuito: {
      id: circuito.id,
      nombre: circuito.nombre,
      mercadoPagoAccessToken: maskToken(circuito.mercadoPagoAccessToken),
      mercadoPagoCollectorId: circuito.mercadoPagoCollectorId,
    },
  });
}

export async function PUT(request: Request) {
  const usuario = await requireRepresentante();
  if (!usuario) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  await request.body?.cancel();
  return Response.json(
    { error: 'Mercado Pago se configura desde el panel de administrador' },
    { status: 403 }
  );
}
