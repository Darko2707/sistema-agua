import { router, roleProcedure } from '../trpc';
import { z } from 'zod';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { db } from '@/db';
import { auditoria, bitacoraCortes, notificaciones } from '@/db/schema';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';
import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';

const confirmarCorteHandler     = new ConfirmarCorteHandler({ residenteRepo, pagoRepo });
const confirmarReconexionHandler = new ConfirmarReconexionHandler({ residenteRepo, pagoRepo });
const pendientesCorteHandler    = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

export const cortesRouter = router({
  pendientesDeCorte: roleProcedure('representante', 'cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      // roleProcedure already validated the role — cast narrows UserRole to the handler's expected subset
      return pendientesCorteHandler.execute({ rol: ctx.user.role as 'representante' | 'cuadrilla_cortes' | 'admin', userId: ctx.user.id, tipo: 'corte' });
    }),

  pendientesDeReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      return pendientesCorteHandler.execute({ rol: ctx.user.role as 'cuadrilla_cortes' | 'admin', userId: ctx.user.id, tipo: 'reconexion' });
    }),

  confirmarCorte: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await confirmarCorteHandler.execute({ perfilId: input.perfilId, trabajadorId: ctx.user.id });
      await db.insert(bitacoraCortes).values({
        perfilId: input.perfilId,
        corteId: result?.id ?? null,
        actorId: ctx.user.id,
        accion: 'corte_confirmado',
        nota: 'Corte confirmado desde el panel operativo',
      });
      await db.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: 'corte.confirmado',
        entidad: 'corte',
        entidadId: result?.id ?? input.perfilId,
        detalle: { perfilId: input.perfilId },
      });
      const perfil = await residenteRepo.findById(input.perfilId);
      if (perfil?.telefono) {
        await db.insert(notificaciones).values({
          userId: perfil.userId,
          perfilId: input.perfilId,
          canal: 'whatsapp',
          tipo: 'corte_pendiente',
          destino: perfil.telefono,
          mensaje: 'Tu servicio fue marcado como cortado. Regulariza tu pago para solicitar reconexion.',
        });
      }
      return result;
    }),

  listarCortados: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async () => {
      return residenteRepo.findByEstado('cortado');
    }),

  confirmarReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await confirmarReconexionHandler.execute({ perfilId: input.perfilId, actorId: ctx.user.id });
      await db.insert(bitacoraCortes).values({
        perfilId: input.perfilId,
        actorId: ctx.user.id,
        accion: 'reconexion_confirmada',
        nota: 'Reconexion confirmada desde el panel operativo',
      });
      await db.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: 'reconexion.confirmada',
        entidad: 'corte',
        entidadId: input.perfilId,
        detalle: { perfilId: input.perfilId },
      });
      const perfil = await residenteRepo.findById(input.perfilId);
      if (perfil?.telefono) {
        await db.insert(notificaciones).values({
          userId: perfil.userId,
          perfilId: input.perfilId,
          canal: 'whatsapp',
          tipo: 'reconexion_confirmada',
          destino: perfil.telefono,
          mensaje: 'Tu reconexion fue confirmada. El servicio quedo restablecido.',
        });
      }
      return result;
    }),
});
