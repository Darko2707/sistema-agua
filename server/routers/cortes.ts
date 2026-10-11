import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// Assignment lookup is kept inline until the operational repository exposes tenant-scoped methods.
// eslint-disable-next-line no-restricted-imports
import { and, eq, isNotNull } from 'drizzle-orm';

import { schedulePushDispatch } from '@/lib/push-dispatcher';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';
import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';
import { CorteOperacionService } from '@/src/application/cortes/services/corte-operacion.service';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { DrizzleCorteOperacionDatabase } from '@/src/infrastructure/db/services/drizzle-corte-operacion.database';
// eslint-disable-next-line no-restricted-imports
import { db } from '@/db';
// eslint-disable-next-line no-restricted-imports
import { asignacionesFraccionamiento, fraccionamientoServicios, servicios, user } from '@/db/schema';

import { router, roleProcedure, operationalRoleProcedure } from '../trpc';

const corteOperacionService = new CorteOperacionService(new DrizzleCorteOperacionDatabase());
const confirmarCorteHandler = new ConfirmarCorteHandler({ corteOperacionService });
const confirmarReconexionHandler = new ConfirmarReconexionHandler({ corteOperacionService });

async function findFraccionamientosAsignados(userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ fraccionamientoId: asignacionesFraccionamiento.fraccionamientoId })
    .from(asignacionesFraccionamiento)
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, asignacionesFraccionamiento.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(asignacionesFraccionamiento.usuarioId, userId),
      eq(asignacionesFraccionamiento.rol, 'cuadrilla_cortes'),
      eq(asignacionesFraccionamiento.activo, true),
      isNotNull(asignacionesFraccionamiento.fraccionamientoId),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.clave, 'agua'),
    ));
  if (rows.length > 0) return rows.map((row) => row.fraccionamientoId!);

  // Las cuentas creadas antes de las asignaciones explícitas ya tienen un
  // fraccionamiento y rol aprobados por administración. Reparamos únicamente
  // esa relación operativa faltante, limitada a su propio tenant y a Agua.
  const [worker] = await db.select({
    fraccionamientoId: user.fraccionamientoId,
    role: user.role,
  }).from(user).where(eq(user.id, userId)).limit(1);
  if (worker?.role !== 'cuadrilla_cortes' || !worker.fraccionamientoId) return [];

  const [agua] = await db.select({ id: fraccionamientoServicios.id })
    .from(fraccionamientoServicios)
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(fraccionamientoServicios.fraccionamientoId, worker.fraccionamientoId),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.clave, 'agua'),
    )).limit(1);
  if (!agua) return [];

  await db.insert(asignacionesFraccionamiento).values({
    usuarioId: userId,
    fraccionamientoId: worker.fraccionamientoId,
    fraccionamientoServicioId: agua.id,
    rol: 'cuadrilla_cortes',
    activo: true,
  }).onConflictDoUpdate({
    target: [asignacionesFraccionamiento.usuarioId, asignacionesFraccionamiento.fraccionamientoId, asignacionesFraccionamiento.fraccionamientoServicioId, asignacionesFraccionamiento.rol],
    set: { activo: true, actualizadoEn: new Date() },
  });
  return [worker.fraccionamientoId];
}

const pendientesCorteHandler = new PendientesCorteHandler({ residenteRepo, findFraccionamientosAsignados });

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
  const fraccionamientosAsignados = await findFraccionamientosAsignados(userId);
  if (!fraccionamientosAsignados.includes(perfilObjetivo.fraccionamientoId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No puedes operar fuera de tu fraccionamiento' });
  }
}

export const cortesRouter = router({
  pendientesDeCorte: roleProcedure('representante', 'cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      // roleProcedure ya validó el rol; el cast estrecha UserRole al contrato del handler.
      return pendientesCorteHandler.execute({
        rol: ctx.user.role as 'representante' | 'cuadrilla_cortes' | 'admin',
        userId: ctx.user.id,
        fraccionamientoId: ctx.user.fraccionamientoId,
        tipo: 'corte',
      });
    }),

  pendientesDeReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .query(async ({ ctx }) => {
      return pendientesCorteHandler.execute({
        rol: ctx.user.role as 'cuadrilla_cortes' | 'admin',
        userId: ctx.user.id,
        fraccionamientoId: ctx.user.fraccionamientoId,
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
      const fraccionamientosAsignados = await findFraccionamientosAsignados(ctx.user.id);
      const rows = await Promise.all(fraccionamientosAsignados.map((fraccionamientoId) => residenteRepo.findByFraccionamientoYEstado!(fraccionamientoId, 'cortado')));
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
