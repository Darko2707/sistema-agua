import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { requireAdmin, unauthorized } from '../../_lib';

export const dynamic = 'force-dynamic';

const circuitoSchema = z.object({
  montoMensual: z.number().positive().max(999999.99),
  montoReconexion: z.number().nonnegative().max(999999.99),
  activo: z.boolean().optional(),
  representanteId: z.string().min(1).nullable().optional(),
});

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
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
      montoReconexion: body.data.montoReconexion.toFixed(2),
      ...(typeof body.data.activo === 'boolean' ? { activo: body.data.activo } : {}),
      representanteId: body.data.representanteId ?? null,
    })
    .where(eq(circuitos.id, id))
    .returning({
      id: circuitos.id,
      nombre: circuitos.nombre,
      montoMensual: circuitos.montoMensual,
      montoReconexion: circuitos.montoReconexion,
      activo: circuitos.activo,
      representanteId: circuitos.representanteId,
      mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
    });

  if (!actualizado) {
    return Response.json({ error: 'Circuito no encontrado' }, { status: 404 });
  }

  return Response.json({ circuito: actualizado });
}
