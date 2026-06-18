import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const circuitoSchema = z.object({
  montoMensual: z.number().positive().max(999999.99),
  mercadoPagoAccessToken: z.string().trim().min(1).optional(),
  mercadoPagoCollectorId: z.string().trim().min(1).optional(),
});

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });

  return usuario?.role === 'admin' ? usuario : null;
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = circuitoSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const [actualizado] = await db
    .update(circuitos)
    .set({
      montoMensual: body.data.montoMensual.toFixed(2),
      ...(body.data.mercadoPagoAccessToken
        ? { mercadoPagoAccessToken: body.data.mercadoPagoAccessToken }
        : {}),
      ...(body.data.mercadoPagoCollectorId
        ? { mercadoPagoCollectorId: body.data.mercadoPagoCollectorId }
        : {}),
    })
    .where(eq(circuitos.id, id))
    .returning({
      id: circuitos.id,
      nombre: circuitos.nombre,
      montoMensual: circuitos.montoMensual,
      mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
    });

  if (!actualizado) {
    return Response.json({ error: 'Circuito no encontrado' }, { status: 404 });
  }

  return Response.json({ circuito: actualizado });
}
