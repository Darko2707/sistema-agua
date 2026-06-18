import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';

import { db } from '@/db';
import { account, circuitos, pagos, user } from '@/db/schema';
import { requireAdmin, unauthorized } from '../../_lib';

export const dynamic = 'force-dynamic';

const representanteUpdateSchema = z.object({
  nombre: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8).optional().or(z.literal('')),
  circuitoId: z.string().uuid().nullable().optional(),
  mercadoPagoAccessToken: z.string().trim().min(1).optional().or(z.literal('')),
  mercadoPagoCollectorId: z.string().trim().min(1).optional().or(z.literal('')),
});

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  const body = representanteUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const representante = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  });
  if (!representante || representante.role !== 'representante') {
    return Response.json({ error: 'Representante no encontrado' }, { status: 404 });
  }

  const emailOcupado = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, body.data.email),
  });
  if (emailOcupado && emailOcupado.id !== id) {
    return Response.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ name: body.data.nombre, email: body.data.email })
      .where(eq(user.id, id));

    await tx.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, id));

    if (body.data.circuitoId) {
      const mpUpdate = {
        representanteId: id,
        ...(body.data.mercadoPagoAccessToken
          ? { mercadoPagoAccessToken: body.data.mercadoPagoAccessToken }
          : {}),
        ...(body.data.mercadoPagoCollectorId
          ? { mercadoPagoCollectorId: body.data.mercadoPagoCollectorId }
          : {}),
      };

      await tx.update(circuitos).set(mpUpdate).where(eq(circuitos.id, body.data.circuitoId));
    }

    if (body.data.password) {
      const hashed = await hashPassword(body.data.password);
      await tx
        .update(account)
        .set({ password: hashed })
        .where(eq(account.userId, id));
    }
  });

  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  const representante = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, id),
  });
  if (!representante || representante.role !== 'representante') {
    return Response.json({ error: 'Representante no encontrado' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, id));
    await tx.update(pagos).set({ representanteId: null }).where(eq(pagos.representanteId, id));
    await tx.delete(user).where(eq(user.id, id));
  });

  return Response.json({ ok: true });
}
