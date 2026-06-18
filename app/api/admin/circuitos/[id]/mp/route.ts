import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { requireAdmin, unauthorized } from '../../../_lib';

export const dynamic = 'force-dynamic';

const mpSchema = z.object({
  mercadoPagoAccessToken: z.string().trim().min(1),
  mercadoPagoCollectorId: z.string().trim().min(1),
});

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  const body = mpSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const [actualizado] = await db
    .update(circuitos)
    .set({
      mercadoPagoAccessToken: body.data.mercadoPagoAccessToken,
      mercadoPagoCollectorId: body.data.mercadoPagoCollectorId,
    })
    .where(eq(circuitos.id, id))
    .returning({
      id: circuitos.id,
      nombre: circuitos.nombre,
      mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
    });

  if (!actualizado) {
    return Response.json({ error: 'Circuito no encontrado' }, { status: 404 });
  }

  return Response.json({ circuito: actualizado });
}
