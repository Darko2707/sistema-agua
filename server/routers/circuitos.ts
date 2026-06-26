import { router, roleProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { circuitoRepo } from '@/src/infrastructure/db/repositories';

export const circuitosRouter = router({
  listar: roleProcedure('admin').query(async () => {
    return circuitoRepo.findAll();
  }),

  toggleActivo: roleProcedure('admin')
    .input(z.object({ circuitoId: z.string().uuid(), activo: z.boolean() }))
    .mutation(async ({ input }) => {
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
      await circuitoRepo.updateMontos(
        input.circuitoId,
        String(input.montoMensual),
        String(input.montoReconexion),
      );
      return { ok: true };
    }),

  // These two queries join the `user` table inline which the current repo interface
  // doesn't support. Kept with inline DB until a richer repo method is added.
  // eslint-disable-next-line no-restricted-imports
  miCircuito: roleProcedure('representante').query(async ({ ctx }) => {
    // eslint-disable-next-line no-restricted-imports
    const { db } = await import('@/db');
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.representanteId, ctx.user.id),
      with: { representante: { columns: { id: true, name: true, email: true } } },
    });
    if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tienes un circuito asignado' });
    return circuito;
  }),

  miCircuitoTesorera: roleProcedure('tesorera').query(async ({ ctx }) => {
    // eslint-disable-next-line no-restricted-imports
    const { db } = await import('@/db');
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.tesoreraId, ctx.user.id),
    });
    if (!circuito) throw new TRPCError({ code: 'NOT_FOUND', message: 'No tienes un circuito asignado' });
    return circuito;
  }),
});
