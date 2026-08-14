import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  auditoria,
  notificaciones,
  pagos,
  perfilesResidente,
  reversosPago,
  tickets,
} from '@/db/schema';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { fechaNegocio } from '@/src/domain/shared/fecha-negocio';
import type { UserRole } from '@/src/application/ports/user.repository';

type ReversarPagoInput = {
  pagoId: string;
  motivo: string;
  actorId: string;
  actorRole: UserRole;
};

export type ReversarPagoResult = {
  notificarReverso: boolean;
};

function assertPuedeReversar(
  actorId: string,
  actorRole: ReversarPagoInput['actorRole'],
  circuito: { representanteId: string | null; tesoreraId: string | null } | null,
) {
  if (actorRole === 'admin') return;
  if (actorRole === 'representante' && circuito?.representanteId === actorId) return;
  if (actorRole === 'tesorera' && circuito?.tesoreraId === actorId) return;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes acceso a este pago' });
}

export async function reversarPagoAtomico(input: ReversarPagoInput): Promise<ReversarPagoResult> {
  return db.transaction(async (tx) => {
    // Todos los flujos de pago/corte serializan primero por perfil. Mantener ese
    // orden evita deadlocks con una reconexion o un pago concurrente.
    await tx.execute(sql`
      SELECT perfil.id
      FROM perfiles_residente AS perfil
      WHERE perfil.id = (
        SELECT pago.perfil_id FROM pagos AS pago WHERE pago.id = ${input.pagoId}
      )
      FOR UPDATE
    `);
    await tx.execute(sql`SELECT id FROM pagos WHERE id = ${input.pagoId} FOR UPDATE`);

    const pago = await tx.query.pagos.findFirst({
      where: eq(pagos.id, input.pagoId),
      with: { perfil: { with: { circuito: true } } },
    });
    if (!pago || !pago.perfil) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
    }

    assertPuedeReversar(input.actorId, input.actorRole, pago.perfil.circuito ?? null);
    if (pago.estado !== 'pagado') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo se pueden reversar pagos pagados' });
    }

    const [actualizado] = await tx
      .update(pagos)
      .set({ estado: 'vencido' })
      .where(and(eq(pagos.id, pago.id), eq(pagos.estado, 'pagado')))
      .returning({ id: pagos.id });
    if (!actualizado) {
      throw new TRPCError({ code: 'CONFLICT', message: 'El pago ya fue modificado por otra operacion' });
    }

    await tx.insert(reversosPago).values({
      pagoId: pago.id,
      actorId: input.actorId,
      motivo: input.motivo,
      estadoAnterior: pago.estado,
    });
    await tx.delete(tickets).where(eq(tickets.pagoId, pago.id));

    const periodo = PeriodoVO.vigente();
    const esMesActual = pago.mes === periodo.mes && pago.anio === periodo.anio;
    const diaNegocio = fechaNegocio().dia;
    const nuevoEstado = pago.esReconexion && pago.perfil.estadoAgua === 'pendiente_reconexion'
      ? 'cortado' as const
      : esMesActual && pago.perfil.estadoAgua === 'activo' && diaNegocio > DIA_CORTE
        ? 'pendiente_corte' as const
        : null;

    let notificarReverso = false;
    if (nuevoEstado) {
      await tx.update(perfilesResidente)
        .set({ estadoAgua: nuevoEstado })
        .where(eq(perfilesResidente.id, pago.perfilId));

      notificarReverso = true;
      await tx.insert(notificaciones).values({
        userId: pago.perfil.userId,
        perfilId: pago.perfilId,
        canal: 'push',
        tipo: 'pago_reversado',
        destino: 'push',
        mensaje: 'Un pago fue reversado. Abre la app para consultar tu estado actualizado.',
        dedupeKey: `pago_reversado:${pago.id}`,
      }).onConflictDoNothing();
    }

    await tx.insert(auditoria).values({
      actorId: input.actorId,
      accion: 'pago.reversado',
      entidad: 'pago',
      entidadId: pago.id,
      detalle: {
        folio: pago.folio,
        motivo: input.motivo,
        mes: pago.mes,
        anio: pago.anio,
      },
    });

    return { notificarReverso };
  });
}
