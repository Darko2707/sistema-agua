import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { schedulePushDispatch } from '@/lib/push-dispatcher';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';
import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';
import { CorteOperacionService } from '@/src/application/cortes/services/corte-operacion.service';
import { residenteRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { DrizzleCorteOperacionDatabase } from '@/src/infrastructure/db/services/drizzle-corte-operacion.database';

import { router, roleProcedure } from '../trpc';

const corteOperacionService = new CorteOperacionService(new DrizzleCorteOperacionDatabase());
const confirmarCorteHandler = new ConfirmarCorteHandler({ corteOperacionService });
const confirmarReconexionHandler = new ConfirmarReconexionHandler({ corteOperacionService });
const pendientesCorteHandler = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

async function assertPerfilDeCuadrilla(userId: string, perfilId: string): Promise<void> {
  const [perfilTrabajador, perfilObjetivo] = await Promise.all([
    residenteRepo.findByUserId(userId),
    residenteRepo.findById(perfilId),
  ]);
  if (!perfilObjetivo) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
  }
  if (!perfilTrabajador || perfilTrabajador.circuitoId !== perfilObjetivo.circuitoId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes operar fuera de tu circuito' });
  }
}

export const cortesRouter = router({
  pendientesDeCorte: roleProcedure('representante', 'cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      // roleProcedure ya validó el rol; el cast estrecha UserRole al contrato del handler.
      return pendientesCorteHandler.execute({
        rol: ctx.user.role as 'representante' | 'cuadrilla_cortes' | 'admin',
        userId: ctx.user.id,
        tipo: 'corte',
      });
    }),

  pendientesDeReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      return pendientesCorteHandler.execute({
        rol: ctx.user.role as 'cuadrilla_cortes' | 'admin',
        userId: ctx.user.id,
        tipo: 'reconexion',
      });
    }),

  confirmarCorte: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await assertPerfilDeCuadrilla(ctx.user.id, input.perfilId);
      }
      const result = await confirmarCorteHandler.execute({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
      });

      // El servicio sólo retorna después del COMMIT que también persistió el outbox.
      schedulePushDispatch();
      return result;
    }),

  listarCortados: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      if (ctx.user.role === 'admin') return residenteRepo.findByEstado('cortado');
      const perfilTrabajador = await residenteRepo.findByUserId(ctx.user.id);
      if (!perfilTrabajador) return [];
      return residenteRepo.findByCircuitoYEstado(perfilTrabajador.circuitoId, 'cortado');
    }),

  confirmarReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await assertPerfilDeCuadrilla(ctx.user.id, input.perfilId);
      }
      const result = await confirmarReconexionHandler.execute({
        perfilId: input.perfilId,
        actorId: ctx.user.id,
      });

      schedulePushDispatch();
      return result;
    }),
});
