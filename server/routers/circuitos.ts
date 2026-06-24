// server/routers/circuitos.ts
import { router, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const circuitosRouter = router({
  // ============================================
  // listar: Listar todos los circuitos (Admin)
  // ============================================
  listar: roleProcedure('admin').query(async () => {
    return db.query.circuitos.findMany({
      orderBy: (c, { asc }) => [asc(c.nombre)],
    });
  }),

  // ============================================
  // toggleActivo: Activar/Inactivar circuito (Admin)
  // ============================================
  toggleActivo: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      activo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await db.update(circuitos)
        .set({ activo: input.activo })
        .where(eq(circuitos.id, input.circuitoId));
      
      return { ok: true };
    }),

  // ============================================
  // actualizarMontos: Modificar costos mensuales y reconexión (Admin)
  // ============================================
  actualizarMontos: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      montoMensual: z.number().positive(),
      montoReconexion: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      await db.update(circuitos)
        .set({
          montoMensual: String(input.montoMensual),
          montoReconexion: String(input.montoReconexion),
        })
        .where(eq(circuitos.id, input.circuitoId));
      
      return { ok: true };
    }),

  // ============================================
  // miCircuito: Obtener el circuito del representante autenticado
  // ============================================
  miCircuito: roleProcedure('representante').query(async ({ ctx }) => {
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      with: {
        representante: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!circuito) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No tienes un circuito asignado',
      });
    }

    return circuito;
  }),

  // ============================================
  // miCircuitoTesorera: Obtener el circuito de la tesorera autenticada
  // ============================================
  miCircuitoTesorera: roleProcedure('tesorera').query(async ({ ctx }) => {
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.tesoreraId, ctx.user.id),
    });

    if (!circuito) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No tienes un circuito asignado',
      });
    }

    return circuito;
  }),
});