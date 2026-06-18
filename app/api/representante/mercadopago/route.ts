import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const mercadoPagoSchema = z.object({
  mercadoPagoAccessToken: z.string().trim().min(1),
  mercadoPagoCollectorId: z.string().trim().min(1),
});

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

  const body = mercadoPagoSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.representanteId, usuario.id),
  });

  if (!circuito) {
    return Response.json({ error: 'No tienes un circuito asignado' }, { status: 404 });
  }

  const [actualizado] = await db
    .update(circuitos)
    .set({
      mercadoPagoAccessToken: body.data.mercadoPagoAccessToken,
      mercadoPagoCollectorId: body.data.mercadoPagoCollectorId,
    })
    .where(eq(circuitos.id, circuito.id))
    .returning({
      id: circuitos.id,
      nombre: circuitos.nombre,
      mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
    });

  return Response.json({ circuito: actualizado });
}
