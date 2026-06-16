import { router, protectedProcedure, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { cortes, perfilesResidente } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const cortesRouter = router({

  // Representante y cuadrilla: lista de residentes pendientes de corte de su circuito
  pendientesDeCorte: roleProcedure('representante', 'cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      const rol = (ctx.user as any).role;

      let circuitoId: string | null = null;

      if (rol === 'representante') {
        const circ = await db.query.circuitos.findFirst({
          where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
        });
        circuitoId = circ?.id ?? null;
      }

      return db.query.perfilesResidente.findMany({
        where: (p, { eq, and }) => circuitoId
          ? and(eq(p.estadoAgua, 'pendiente_corte'), eq(p.circuitoId, circuitoId))
          : eq(p.estadoAgua, 'pendiente_corte'),
        with: { usuario: true, circuito: true },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
      });
    }),

  // ✅ NUEVO: Lista de residentes pendientes de reconexión (pagaron, esperan reconexión física)
  pendientesDeReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async () => {
      return db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.estadoAgua, 'pendiente_reconexion'),
        with: { usuario: true, circuito: true },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
      });
    }),

  // Cuadrilla: confirma que cortó físicamente el servicio
  confirmarCorte: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.id, input.perfilId),
      });
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });
      if (perfil.estadoAgua !== 'pendiente_corte') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El residente no está pendiente de corte' });
      }

      // Registra el corte
      const [corte] = await db.insert(cortes).values({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
        motivo: 'falta_pago',
        activo: true,
      }).returning();

      // Cambia estado a cortado
      await db.update(perfilesResidente)
        .set({ estadoAgua: 'cortado' })
        .where(eq(perfilesResidente.id, input.perfilId));

      return corte;
    }),

  // Cuadrilla: lista de cortes activos (ya cortados, esperando pago para reconectar)
  listarCortados: roleProcedure('cuadrilla_cortes', 'admin').query(async () => {
    return db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.estadoAgua, 'cortado'),
      with: { usuario: true, circuito: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
  }),

  // Cuadrilla: confirma reconexión física (después de que el residente pagó)
  confirmarReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.id, input.perfilId),
      });
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });
      if (perfil.estadoAgua !== 'cortado' && perfil.estadoAgua !== ('pendiente_reconexion' as string)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El residente no está cortado o pendiente de reconexión' });
      }

      // Cierra el corte activo
      const corteActivo = await db.query.cortes.findFirst({
        where: (c, { eq, and }) => and(
          eq(c.perfilId, input.perfilId),
          eq(c.activo, true)
        ),
      });
      if (corteActivo) {
        await db.update(cortes)
          .set({ activo: false, fechaReconexion: new Date(), reconectadoPor: ctx.user.id })
          .where(eq(cortes.id, corteActivo.id));
      }

      // Regresa a activo
      await db.update(perfilesResidente)
        .set({ estadoAgua: 'activo' })
        .where(eq(perfilesResidente.id, input.perfilId));

      return { ok: true };
    }),

  // Operador de pozo: corte manual por mantenimiento u otro motivo
  crearCorteManual: roleProcedure('operador_pozo', 'admin')
    .input(z.object({
      perfilId: z.string().uuid(),
      motivo: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const perfil = await db.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.id, input.perfilId),
      });
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });

      const [corte] = await db.insert(cortes).values({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
        motivo: input.motivo,
        activo: true,
      }).returning();

      await db.update(perfilesResidente)
        .set({ estadoAgua: 'cortado' })
        .where(eq(perfilesResidente.id, input.perfilId));

      return corte;
    }),
});