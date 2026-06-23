import { router, roleProcedure } from '../trpc';
import { z } from 'zod';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';
import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';

const confirmarCorteHandler     = new ConfirmarCorteHandler({ residenteRepo, pagoRepo });
const confirmarReconexionHandler = new ConfirmarReconexionHandler({ residenteRepo, pagoRepo });
const pendientesCorteHandler    = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

export const cortesRouter = router({
  pendientesDeCorte: roleProcedure('representante', 'cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      const rol = (ctx.user as { role?: string }).role as 'representante' | 'cuadrilla_cortes' | 'admin';
      return pendientesCorteHandler.execute({ rol, userId: ctx.user.id, tipo: 'corte' });
    }),

  pendientesDeReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      const rol = (ctx.user as { role?: string }).role as 'cuadrilla_cortes' | 'admin';
      return pendientesCorteHandler.execute({ rol, userId: ctx.user.id, tipo: 'reconexion' });
    }),

  confirmarCorte: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return confirmarCorteHandler.execute({ perfilId: input.perfilId, trabajadorId: ctx.user.id });
    }),

  listarCortados: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async () => {
      return residenteRepo.findByEstado('cortado');
    }),

  confirmarReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return confirmarReconexionHandler.execute({ perfilId: input.perfilId, actorId: ctx.user.id });
    }),
});
