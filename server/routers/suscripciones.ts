import { z } from 'zod';
import { router, roleProcedure } from '../trpc';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';

const tenantInput = z.object({ fraccionamientoId: z.string().uuid() });

export const suscripcionesRouter = router({
  estado: roleProcedure('admin', 'representante', 'tesorera', 'cuadrilla_cortes', 'operador_pozo', 'residente')
    .input(z.object({ fraccionamientoId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.role === 'admin' ? input?.fraccionamientoId : ctx.user.fraccionamientoId;
      if (!tenantId) return null;
      return subscriptionService.current(tenantId);
    }),

  listar: roleProcedure('admin').query(async () => subscriptionService.listAll()),

  renovar: roleProcedure('admin')
    .input(tenantInput.extend({ referenciaExterna: z.string().trim().max(200).optional() }))
    .mutation(async ({ ctx, input }) => subscriptionService.renew({
      actorId: ctx.user.id,
      fraccionamientoId: input.fraccionamientoId,
      referenciaExterna: input.referenciaExterna,
    })),

  suspender: roleProcedure('admin')
    .input(tenantInput)
    .mutation(async ({ ctx, input }) => subscriptionService.changeState({
      actorId: ctx.user.id,
      fraccionamientoId: input.fraccionamientoId,
      estado: 'suspendida',
    })),

  cancelar: roleProcedure('admin')
    .input(tenantInput)
    .mutation(async ({ ctx, input }) => subscriptionService.changeState({
      actorId: ctx.user.id,
      fraccionamientoId: input.fraccionamientoId,
      estado: 'cancelada',
    })),
});
