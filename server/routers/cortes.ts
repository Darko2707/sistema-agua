import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// Assignment lookup is kept inline until the operational repository exposes tenant-scoped methods.
// eslint-disable-next-line no-restricted-imports
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

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
import {
  asignacionesFraccionamiento,
  bitacoraCortes,
  evidenciasOrdenTrabajo,
  fraccionamientoServicios,
  ordenesTrabajo,
  perfilesResidente,
  servicios,
  user,
} from '@/db/schema';

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
    .input(z.object({ perfilId: z.string().uuid(), ordenId: z.string().uuid().optional(), evidenciaUrl: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') {
        await assertPerfilDeCuadrilla(ctx.user.id, input.perfilId, ctx.user.fraccionamientoId);
      }
      const result = await confirmarCorteHandler.execute({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
        ordenId: input.ordenId,
        evidenciaUrl: input.evidenciaUrl,
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

  evidenciasFotograficas: roleProcedure('admin', 'representante', 'cuadrilla_cortes')
    .input(z.object({
      perfilId: z.string().uuid().optional(),
      ordenId: z.string().uuid().optional(),
      corteId: z.string().uuid().optional(),
      tipo: z.enum(['corte', 'reconexion']).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const viewerRole = ctx.user.role;
      const tenantId = ctx.user.fraccionamientoId;

      // 1. Aislamiento multi-tenant estricto
      if (viewerRole === 'representante') {
        if (!tenantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No tienes un fraccionamiento asignado' });
        }
        if (input?.perfilId) {
          const [p] = await db.select({ id: perfilesResidente.id, fraccionamientoId: perfilesResidente.fraccionamientoId })
            .from(perfilesResidente)
            .where(eq(perfilesResidente.id, input.perfilId))
            .limit(1);
          if (!p || p.fraccionamientoId !== tenantId) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
        }
        if (input?.ordenId) {
          const [o] = await db.select({ id: ordenesTrabajo.id, fraccionamientoId: ordenesTrabajo.fraccionamientoId })
            .from(ordenesTrabajo)
            .where(eq(ordenesTrabajo.id, input.ordenId))
            .limit(1);
          if (!o || o.fraccionamientoId !== tenantId) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
        }
      } else if (viewerRole === 'cuadrilla_cortes') {
        const fraccsAsignados = await findFraccionamientosAsignados(ctx.user.id);
        if (fraccsAsignados.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Sin asignaciones operativas' });
        }
        if (input?.perfilId) {
          const [p] = await db.select({ id: perfilesResidente.id, fraccionamientoId: perfilesResidente.fraccionamientoId })
            .from(perfilesResidente)
            .where(eq(perfilesResidente.id, input.perfilId))
            .limit(1);
          if (!p || !p.fraccionamientoId || !fraccsAsignados.includes(p.fraccionamientoId)) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
        }
        if (input?.ordenId) {
          const [o] = await db.select({ id: ordenesTrabajo.id, fraccionamientoId: ordenesTrabajo.fraccionamientoId })
            .from(ordenesTrabajo)
            .where(eq(ordenesTrabajo.id, input.ordenId))
            .limit(1);
          if (!o || !fraccsAsignados.includes(o.fraccionamientoId)) {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
        }
      }

      // 2. Consulta de bitacoraCortes con foto
      const bitacoraConditions = [isNotNull(bitacoraCortes.fotoUrl)];
      if (viewerRole === 'representante') {
        bitacoraConditions.push(eq(perfilesResidente.fraccionamientoId, tenantId!));
      } else if (viewerRole === 'cuadrilla_cortes') {
        const fraccsAsignados = await findFraccionamientosAsignados(ctx.user.id);
        bitacoraConditions.push(inArray(perfilesResidente.fraccionamientoId, fraccsAsignados));
      }
      if (input?.perfilId) {
        bitacoraConditions.push(eq(bitacoraCortes.perfilId, input.perfilId));
      }
      if (input?.corteId) {
        bitacoraConditions.push(eq(bitacoraCortes.corteId, input.corteId));
      }

      const bitacoraRows = await db.select({
        id: bitacoraCortes.id,
        corteId: bitacoraCortes.corteId,
        perfilId: bitacoraCortes.perfilId,
        actorId: bitacoraCortes.actorId,
        accion: bitacoraCortes.accion,
        nota: bitacoraCortes.nota,
        fotoUrl: bitacoraCortes.fotoUrl,
        creadoEn: bitacoraCortes.creadoEn,
        trabajadorNombre: user.name,
        edificio: perfilesResidente.edificio,
        departamento: perfilesResidente.departamento,
        fraccionamientoId: perfilesResidente.fraccionamientoId,
      })
        .from(bitacoraCortes)
        .innerJoin(perfilesResidente, eq(perfilesResidente.id, bitacoraCortes.perfilId))
        .leftJoin(user, eq(user.id, bitacoraCortes.actorId))
        .where(and(...bitacoraConditions))
        .orderBy(desc(bitacoraCortes.creadoEn))
        .limit(input?.limit ?? 50);

      // 3. Consulta de evidenciasOrdenTrabajo
      const ordenConditions = [];
      if (viewerRole === 'representante') {
        ordenConditions.push(eq(evidenciasOrdenTrabajo.fraccionamientoId, tenantId!));
      } else if (viewerRole === 'cuadrilla_cortes') {
        const fraccsAsignados = await findFraccionamientosAsignados(ctx.user.id);
        ordenConditions.push(inArray(evidenciasOrdenTrabajo.fraccionamientoId, fraccsAsignados));
      }
      if (input?.ordenId) {
        ordenConditions.push(eq(evidenciasOrdenTrabajo.ordenTrabajoId, input.ordenId));
      }
      if (input?.perfilId) {
        ordenConditions.push(eq(ordenesTrabajo.perfilId, input.perfilId));
      }

      const ordenRows = await db.select({
        id: evidenciasOrdenTrabajo.id,
        ordenTrabajoId: evidenciasOrdenTrabajo.ordenTrabajoId,
        fraccionamientoId: evidenciasOrdenTrabajo.fraccionamientoId,
        subidoPor: evidenciasOrdenTrabajo.subidoPor,
        referenciaArchivo: evidenciasOrdenTrabajo.referenciaArchivo,
        creadoEn: evidenciasOrdenTrabajo.creadoEn,
        ordenTipo: ordenesTrabajo.tipo,
        perfilId: ordenesTrabajo.perfilId,
        trabajadorNombre: user.name,
        edificio: perfilesResidente.edificio,
        departamento: perfilesResidente.departamento,
      })
        .from(evidenciasOrdenTrabajo)
        .innerJoin(ordenesTrabajo, eq(ordenesTrabajo.id, evidenciasOrdenTrabajo.ordenTrabajoId))
        .innerJoin(perfilesResidente, eq(perfilesResidente.id, ordenesTrabajo.perfilId))
        .leftJoin(user, eq(user.id, evidenciasOrdenTrabajo.subidoPor))
        .where(ordenConditions.length > 0 ? and(...ordenConditions) : undefined)
        .orderBy(desc(evidenciasOrdenTrabajo.creadoEn))
        .limit(input?.limit ?? 50);

      // 4. Combinar y normalizar resultados
      const items = [
        ...bitacoraRows.map((b) => {
          const tipoOrden: 'corte' | 'reconexion' = b.accion.includes('reconexion') ? 'reconexion' : 'corte';
          const ref = b.fotoUrl!;
          return {
            id: b.id,
            tipo: tipoOrden,
            url: `/api/upload?ref=${encodeURIComponent(ref)}`,
            referencia: ref,
            fechaCaptura: b.creadoEn,
            trabajador: {
              id: b.actorId,
              nombre: b.trabajadorNombre ?? 'Cuadrilla operativa',
            },
            vivienda: {
              perfilId: b.perfilId,
              edificio: b.edificio,
              departamento: b.departamento,
            },
            accion: b.accion,
            nota: b.nota,
            fraccionamientoId: b.fraccionamientoId,
          };
        }),
        ...ordenRows.map((o) => ({
          id: o.id,
          tipo: o.ordenTipo as 'corte' | 'reconexion',
          url: `/api/upload?ref=${encodeURIComponent(o.referenciaArchivo)}`,
          referencia: o.referenciaArchivo,
          fechaCaptura: o.creadoEn,
          trabajador: {
            id: o.subidoPor,
            nombre: o.trabajadorNombre ?? 'Cuadrilla operativa',
          },
          vivienda: {
            perfilId: o.perfilId,
            edificio: o.edificio,
            departamento: o.departamento,
          },
          accion: `orden_${o.ordenTipo}`,
          nota: null,
          fraccionamientoId: o.fraccionamientoId,
        })),
      ];

      const filtrados = input?.tipo ? items.filter((it) => it.tipo === input.tipo) : items;
      filtrados.sort((a, b) => new Date(b.fechaCaptura).getTime() - new Date(a.fechaCaptura).getTime());
      return filtrados.slice(0, input?.limit ?? 50);
    }),
});
