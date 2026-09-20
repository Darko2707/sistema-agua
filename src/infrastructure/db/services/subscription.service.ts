import { and, desc, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { db } from '@/db';
import { auditoria, fraccionamientos, suscripcionesFraccionamiento } from '@/db/schema';

export type SubscriptionStatus = 'activa' | 'gracia' | 'vencida' | 'suspendida' | 'cancelada';

export type SubscriptionView = {
  id: string;
  fraccionamientoId: string;
  estado: SubscriptionStatus;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  graciaHasta: Date | null;
  puedeOperar: boolean;
  soloLectura: boolean;
};

type SubscriptionDates = Pick<typeof suscripcionesFraccionamiento.$inferSelect, 'estado' | 'vigenciaHasta' | 'graciaHasta'>;

function effectiveStatus(row: SubscriptionDates, now = new Date()): SubscriptionStatus {
  if (row.estado === 'suspendida' || row.estado === 'cancelada') return row.estado;
  if (now <= row.vigenciaHasta) return 'activa';
  if (row.graciaHasta && now <= row.graciaHasta) return 'gracia';
  return 'vencida';
}

function toView(row: typeof suscripcionesFraccionamiento.$inferSelect, now = new Date()): SubscriptionView {
  const estado = effectiveStatus(row, now);
  return {
    id: row.id,
    fraccionamientoId: row.fraccionamientoId,
    estado,
    vigenciaDesde: row.vigenciaDesde,
    vigenciaHasta: row.vigenciaHasta,
    graciaHasta: row.graciaHasta,
    puedeOperar: estado === 'activa' || estado === 'gracia',
    // Durante gracia las operaciones siguen permitidas; el bloqueo inicia al
    // terminar gracia o ante suspension/cancelacion explicita.
    soloLectura: estado === 'vencida' || estado === 'suspendida' || estado === 'cancelada',
  };
}

export class SubscriptionService {
  async current(fraccionamientoId: string): Promise<SubscriptionView | null> {
    const row = await db.query.suscripcionesFraccionamiento.findFirst({
      where: (s, { eq, and, inArray }) => and(
        eq(s.fraccionamientoId, fraccionamientoId),
        inArray(s.estado, ['activa', 'gracia']),
      ),
      orderBy: (s, { desc }) => [desc(s.vigenciaHasta)],
    });
    return row ? toView(row) : null;
  }

  async requireOperational(fraccionamientoId: string): Promise<SubscriptionView> {
    const current = await this.current(fraccionamientoId);
    if (!current || !current.puedeOperar) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El fraccionamiento no tiene una suscripcion operativa vigente' });
    }
    return current;
  }

  async listAll() {
    const rows = await db
      .select({
        id: suscripcionesFraccionamiento.id,
        fraccionamientoId: suscripcionesFraccionamiento.fraccionamientoId,
        nombre: fraccionamientos.nombre,
        estado: suscripcionesFraccionamiento.estado,
        vigenciaDesde: suscripcionesFraccionamiento.vigenciaDesde,
        vigenciaHasta: suscripcionesFraccionamiento.vigenciaHasta,
        graciaHasta: suscripcionesFraccionamiento.graciaHasta,
      })
      .from(suscripcionesFraccionamiento)
      .innerJoin(fraccionamientos, eq(fraccionamientos.id, suscripcionesFraccionamiento.fraccionamientoId))
      .orderBy(desc(suscripcionesFraccionamiento.vigenciaHasta));
    return rows.map(row => ({ ...row, estadoEfectivo: effectiveStatus(row) }));
  }

  async renew(input: { actorId: string; fraccionamientoId: string; referenciaExterna?: string }) {
    const now = new Date();
    return db.transaction(async tx => {
      const current = await tx.query.suscripcionesFraccionamiento.findFirst({
        where: (s, { eq, and, inArray }) => and(
          eq(s.fraccionamientoId, input.fraccionamientoId),
          inArray(s.estado, ['activa', 'gracia']),
        ),
        orderBy: (s, { desc }) => [desc(s.vigenciaHasta)],
      });
      const desde = current && current.vigenciaHasta > now ? current.vigenciaHasta : now;
      const hasta = new Date(desde);
      hasta.setUTCFullYear(hasta.getUTCFullYear() + 1);
      let id: string;
      if (current) {
        const [updated] = await tx.update(suscripcionesFraccionamiento)
          .set({ estado: 'activa', vigenciaHasta: hasta, graciaHasta: null, referenciaExterna: input.referenciaExterna, actualizadoEn: now })
          .where(eq(suscripcionesFraccionamiento.id, current.id))
          .returning({ id: suscripcionesFraccionamiento.id });
        id = updated.id;
      } else {
        const [created] = await tx.insert(suscripcionesFraccionamiento).values({
          fraccionamientoId: input.fraccionamientoId,
          plan: 'anual',
          estado: 'activa',
          vigenciaDesde: desde,
          vigenciaHasta: hasta,
          referenciaExterna: input.referenciaExterna,
        }).returning({ id: suscripcionesFraccionamiento.id });
        id = created.id;
      }
      await tx.insert(auditoria).values({
        actorId: input.actorId,
        accion: 'suscripcion.renovada',
        entidad: 'suscripciones_fraccionamiento',
        entidadId: id,
        detalle: { fraccionamientoId: input.fraccionamientoId, vigenciaHasta: hasta.toISOString(), referenciaExterna: input.referenciaExterna ?? null },
      });
      return { id, vigenciaDesde: desde, vigenciaHasta: hasta, estado: 'activa' as const };
    });
  }

  async changeState(input: { actorId: string; fraccionamientoId: string; estado: 'suspendida' | 'cancelada' }) {
    return db.transaction(async tx => {
      const [updated] = await tx.update(suscripcionesFraccionamiento)
        .set({ estado: input.estado, actualizadoEn: new Date() })
        .where(and(
          eq(suscripcionesFraccionamiento.fraccionamientoId, input.fraccionamientoId),
          inArray(suscripcionesFraccionamiento.estado, ['activa', 'gracia']),
        ))
        .returning({ id: suscripcionesFraccionamiento.id });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'No hay una suscripcion activa para ese fraccionamiento' });
      await tx.insert(auditoria).values({
        actorId: input.actorId,
        accion: `suscripcion.${input.estado}`,
        entidad: 'suscripciones_fraccionamiento',
        entidadId: updated.id,
        detalle: { fraccionamientoId: input.fraccionamientoId },
      });
      return { ok: true };
    });
  }
}

export const subscriptionService = new SubscriptionService();
