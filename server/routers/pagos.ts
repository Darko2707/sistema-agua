import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { pagos, perfilesResidente, cortes } from '@/db/schema';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { ticketQueue } from '@/server/queues';
import { TRPCError } from '@trpc/server';

const MONTO_MENSUAL = '50.00';
const MONTO_RECONEXION = '300.00';

export const pagosRouter = router({
  // Historial del residente autenticado
  miHistorial: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    });
    if (!perfil) return { perfil: null, pagos: [], corteActivo: false };

    const historial = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      limit: 12,
    });

    const corteActivo = await db.query.cortes.findFirst({
      where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
    });

    return { perfil, pagos: historial, corteActivo: !!corteActivo };
  }),

  // Pagar mensualidad (y reconexión si está cortado)
  pagar: protectedProcedure
    .input(z.object({ metodo: z.enum(['transferencia', 'efectivo']) }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.userId, ctx.user.id),
      });
      if (!perfil) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Completa tu perfil primero' });

      const ahora = new Date();
      const mes = ahora.getMonth() + 1;
      const anio = ahora.getFullYear();

      // Ya pagó este mes?
      const yaPago = await db.query.pagos.findFirst({
        where: (p, { eq, and }) =>
          and(eq(p.perfilId, perfil.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      });
      if (yaPago) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya pagaste este mes' });

      // Corte activo?
      const corteActivo = await db.query.cortes.findFirst({
        where: (c, { eq, and }) => and(eq(c.perfilId, perfil.id), eq(c.activo, true)),
      });

      const esReconexion = !!corteActivo;
      const monto = esReconexion
        ? (parseFloat(MONTO_MENSUAL) + parseFloat(MONTO_RECONEXION)).toFixed(2)
        : MONTO_MENSUAL;

      const folio = `AGU-${nanoid(10).toUpperCase()}`;

      // Usar transacción para garantizar consistencia
      const result = await db.transaction(async (tx) => {
        const [pago] = await tx
          .insert(pagos)
          .values({
            perfilId: perfil.id,
            mes,
            anio,
            monto,
            estado: 'pagado',
            metodo: input.metodo,
            folio,
            esReconexion,
            fechaPago: new Date(),
          })
          .returning();

        if (corteActivo) {
          await tx
            .update(cortes)
            .set({ activo: false, fechaReconexion: new Date() })
            .where(eq(cortes.id, corteActivo.id));

          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'activo' })
            .where(eq(perfilesResidente.id, perfil.id));
        }

        return pago;
      });

      // Encolar generación de ticket (no dentro de la transacción)
      await ticketQueue.add('generar', {
        pagoId: result.id,
        folio,
        email: ctx.user.email,
      });

      return { folio, monto, esReconexion };
    }),

  // Admin/representante: historial de un perfil específico
  historialDe: roleProcedure('admin', 'representante')
    .input(z.object({ perfilId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db.query.pagos.findMany({
        where: (p, { eq }) => eq(p.perfilId, input.perfilId),
        orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      });
    }),

  // Resumen del mes para dashboards
  resumenMes: roleProcedure('admin', 'representante').query(async ({ ctx }) => {
    const ahora = new Date();
    const mes = ahora.getMonth() + 1;
    const anio = ahora.getFullYear();
    const rol = (ctx.user as any).role;

    let perfiles;
    if (rol === 'admin') {
      perfiles = await db.query.perfilesResidente.findMany({ with: { circuito: true } });
    } else {
      const miCircuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      });
      if (!miCircuito) {
        return { totalDeptos: 0, pagados: 0, recaudado: 0, porCircuito: [] };
      }
      perfiles = await db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.circuitoId, miCircuito.id),
        with: { circuito: true },
      });
    }

    const pagosDelMes = await db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
    });

    const idsPagados = new Set(pagosDelMes.map((p) => p.perfilId));
    const pagados = perfiles.filter((p) => idsPagados.has(p.id)).length;
    const recaudado = pagosDelMes
      .filter((p) => perfiles.some((perf) => perf.id === p.perfilId))
      .reduce((acc, p) => acc + parseFloat(p.monto), 0);

    // Agrupar por circuito (solo para admin)
    const porCircuitoMap = new Map<string, { nombre: string; total: number; pagados: number }>();
    for (const perfil of perfiles) {
      const nombre = perfil.circuito?.nombre ?? 'Sin circuito';
      const entry = porCircuitoMap.get(nombre) ?? { nombre, total: 0, pagados: 0 };
      entry.total += 1;
      if (idsPagados.has(perfil.id)) entry.pagados += 1;
      porCircuitoMap.set(nombre, entry);
    }

    return {
      totalDeptos: perfiles.length,
      pagados,
      recaudado,
      porCircuito: Array.from(porCircuitoMap.values()),
    };
  }),
});