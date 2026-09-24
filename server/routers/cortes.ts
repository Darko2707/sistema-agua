import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// Assignment lookup is kept inline until the operational repository exposes tenant-scoped methods.
// eslint-disable-next-line no-restricted-imports
import { and, eq } from 'drizzle-orm';

import { schedulePushDispatch } from '@/lib/push-dispatcher';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';
import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';
import { CorteOperacionService } from '@/src/application/cortes/services/corte-operacion.service';
import { residenteRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { DrizzleCorteOperacionDatabase } from '@/src/infrastructure/db/services/drizzle-corte-operacion.database';
// eslint-disable-next-line no-restricted-imports
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports
import { asignacionesCircuito, fraccionamientoServicios, servicios } from '@/db/schema';

import { router, roleProcedure, operationalRoleProcedure } from '../trpc';

const corteOperacionService = new CorteOperacionService(new DrizzleCorteOperacionDatabase());
const confirmarCorteHandler = new ConfirmarCorteHandler({ corteOperacionService });
const confirmarReconexionHandler = new ConfirmarReconexionHandler({ corteOperacionService });

async function findCircuitosAsignados(userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ circuitoId: asignacionesCircuito.circuitoId })
    .from(asignacionesCircuito)
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, asignacionesCircuito.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(asignacionesCircuito.usuarioId, userId),
      eq(asignacionesCircuito.rol, 'cuadrilla_cortes'),
      eq(asignacionesCircuito.activo, true),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.clave, 'agua'),
    ));
  return rows.map((row) => row.circuitoId);
}

const pendientesCorteHandler = new PendientesCorteHandler({ residenteRepo, circuitoRepo, findCircuitosAsignados });

async function assertPerfilDeCuadrilla(userId: string, perfilId: string, tenantId?: string | null): Promise<void> {
  const perfilObjetivo = await residenteRepo.findById(perfilId);
  if (!perfilObjetivo) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
  }
  if (tenantId && perfilObjetivo.fraccionamientoId !== tenantId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes operar fuera de tu fraccionamiento' });
  }
  if (!perfilObjetivo.fraccionamientoId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'El perfil no tiene fraccionamiento asignado' });
  }
  const [assignment] = await db.select({ id: asignacionesCircuito.id })
    .from(asignacionesCircuito)
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, asignacionesCircuito.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(asignacionesCircuito.usuarioId, userId),
      eq(asignacionesCircuito.fraccionamientoId, perfilObjetivo.fraccionamientoId),
      eq(asignacionesCircuito.circuitoId, perfilObjetivo.circuitoId),
      eq(asignacionesCircuito.rol, 'cuadrilla_cortes'),
      eq(asignacionesCircuito.activo, true),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.clave, 'agua'),
    ))
    .limit(1);
  if (!assignment) {
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

  confirmarCorte: operationalRoleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid(), ordenId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await assertPerfilDeCuadrilla(ctx.user.id, input.perfilId, ctx.user.fraccionamientoId);
      }
      const result = await confirmarCorteHandler.execute({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
        ordenId: input.ordenId,
      });

      // El servicio sólo retorna después del COMMIT que también persistió el outbox.
      schedulePushDispatch();
      return result;
    }),

  listarCortados: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      if (ctx.user.role === 'admin') return residenteRepo.findByEstado('cortado');
      const circuitosAsignados = await findCircuitosAsignados(ctx.user.id);
      const rows = await Promise.all(circuitosAsignados.map((circuitoId) => residenteRepo.findByCircuitoYEstado(circuitoId, 'cortado')));
      return rows.flat();
    }),

  confirmarReconexion: operationalRoleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ perfilId: z.string().uuid(), ordenId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await assertPerfilDeCuadrilla(ctx.user.id, input.perfilId, ctx.user.fraccionamientoId);
      }
      const result = await confirmarReconexionHandler.execute({
        perfilId: input.perfilId,
        actorId: ctx.user.id,
        ordenId: input.ordenId,
      });

      schedulePushDispatch();
      return result;
    }),
});
