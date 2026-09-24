/* eslint-disable no-restricted-imports -- legacy router boundary; migrate queries to repositories incrementally. */
import { router, roleProcedure } from '../trpc';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { circuitoRepo } from '@/src/infrastructure/db/repositories';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { db } from '@/db';
import { auditoria, circuitos, fraccionamientos, user } from '@/db/schema';

const circuitoOutputColumns = {
  id: true,
  nombre: true,
  representanteId: true,
  tesoreraId: true,
  montoMensual: true,
  montoReconexion: true,
  mercadoPagoCollectorId: true,
  activo: true,
} as const;

export const circuitosRouter = router({
  listar: roleProcedure('admin').query(async () => {
    return db.select({
      id: circuitos.id,
      nombre: circuitos.nombre,
      fraccionamientoId: circuitos.fraccionamientoId,
      fraccionamientoNombre: fraccionamientos.nombre,
      representanteId: circuitos.representanteId,
      tesoreraId: circuitos.tesoreraId,
      montoMensual: circuitos.montoMensual,
      montoReconexion: circuitos.montoReconexion,
      mercadoPagoCollectorId: circuitos.mercadoPagoCollectorId,
      activo: circuitos.activo,
    }).from(circuitos)
      .leftJoin(fraccionamientos, eq(fraccionamientos.id, circuitos.fraccionamientoId))
      .orderBy(circuitos.nombre);
  }),

  listarPorFraccionamiento: roleProcedure('admin')
    .input(z.object({ fraccionamientoId: z.string().uuid() }))
    .query(async ({ input }) => db.query.circuitos.findMany({
      where: (c, { eq }) => eq(c.fraccionamientoId, input.fraccionamientoId),
      orderBy: (c, { asc }) => [asc(c.nombre)],
    })),

  crear: roleProcedure('admin')
    .input(z.object({
      fraccionamientoId: z.string().uuid(),
      nombre: z.string().trim().min(1).max(120),
      montoMensual: z.number().min(0),
      montoReconexion: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await subscriptionService.requireOperational(input.fraccionamientoId);
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(circuitos).values({
          fraccionamientoId: input.fraccionamientoId,
          nombre: input.nombre,
          montoMensual: input.montoMensual.toFixed(2),
          montoReconexion: input.montoReconexion.toFixed(2),
        }).returning({ id: circuitos.id, nombre: circuitos.nombre });
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: 'circuito.creado',
          entidad: 'circuitos',
          entidadId: row.id,
          detalle: { fraccionamientoId: input.fraccionamientoId, nombre: row.nombre },
        });
        return row;
      });
      return created;
    }),

  actualizarConfiguracion: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      montoMensual: z.number().positive(),
      montoReconexion: z.number().positive(),
      activo: z.boolean(),
      representanteId: z.string().min(1).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const circuito = await circuitoRepo.findById(input.circuitoId);
      if (!circuito?.fraccionamientoId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito sin fraccionamiento' });
      await subscriptionService.requireOperational(circuito.fraccionamientoId);
      if (input.representanteId) {
        const [representante] = await db.select({ id: user.id, role: user.role, fraccionamientoId: user.fraccionamientoId })
          .from(user).where(eq(user.id, input.representanteId)).limit(1);
        if (!representante || representante.role !== 'representante' || representante.fraccionamientoId !== circuito.fraccionamientoId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El representante no pertenece a este fraccionamiento' });
        }
      }
      await db.transaction(async (tx) => {
        await tx.update(circuitos).set({
          montoMensual: input.montoMensual.toFixed(2),
          montoReconexion: input.montoReconexion.toFixed(2),
          activo: input.activo,
          representanteId: input.representanteId,
          updatedAt: new Date(),
        }).where(eq(circuitos.id, input.circuitoId));
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: 'circuito.configuracion.actualizada',
          entidad: 'circuitos',
          entidadId: input.circuitoId,
          detalle: { fraccionamientoId: circuito.fraccionamientoId, ...input },
        });
      });
      return { ok: true };
    }),

  toggleActivo: roleProcedure('admin')
    .input(z.object({ circuitoId: z.string().uuid(), activo: z.boolean() }))
    .mutation(async ({ input }) => {
      const circuito = await circuitoRepo.findById(input.circuitoId);
      if (!circuito?.fraccionamientoId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito sin fraccionamiento' });
      await subscriptionService.requireOperational(circuito.fraccionamientoId);
      await circuitoRepo.updateActivo(input.circuitoId, input.activo);
      return { ok: true };
    }),

  actualizarMontos: roleProcedure('admin')
    .input(z.object({
      circuitoId:      z.string().uuid(),
      montoMensual:    z.number().positive(),
      montoReconexion: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      const circuito = await circuitoRepo.findById(input.circuitoId);
      if (!circuito?.fraccionamientoId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Circuito sin fraccionamiento' });
      await subscriptionService.requireOperational(circuito.fraccionamientoId);
      await circuitoRepo.updateMontos(
        input.circuitoId,
        String(input.montoMensual),
        String(input.montoReconexion),
      );
      return { ok: true };
    }),

  // These two queries join the `user` table inline which the current repo interface
  // doesn't support. Kept with inline DB until a richer repo method is added.
  miCircuito: roleProcedure('representante').query(async ({ ctx }) => {
    const { db } = await import('@/db');
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      columns: circuitoOutputColumns,
      with: { representante: { columns: { id: true, name: true, email: true } } },
    });
    if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tienes un circuito asignado' });
    return circuito;
  }),

  miCircuitoTesorera: roleProcedure('tesorera').query(async ({ ctx }) => {
    const { db } = await import('@/db');
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.tesoreraId, ctx.user.id),
      columns: circuitoOutputColumns,
    });
    if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tienes un circuito asignado' });
    return circuito;
  }),
});
