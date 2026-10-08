/* eslint-disable no-restricted-imports -- legacy router boundary; migrate queries to repositories incrementally. */
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { db } from '@/db';
import {
  auditoria,
  cargosServicios,
  fraccionamientoMetodosPago,
  fraccionamientos,
  ordenesTrabajo,
  pagos,
  perfilesResidente,
  session,
  suscripcionesFraccionamiento,
  user,
} from '@/db/schema';
import { encryptToken } from '@/lib/crypto';
import { router, publicProcedure, roleProcedure } from '../trpc';

/** Convierte el nombre visible en el identificador público del tenant. */
export function slugifyFraccionamiento(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');

  if (!slug) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'El nombre debe contener al menos una letra o número',
    });
  }

  return slug;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === '23505';
}

export const fraccionamientosRouter = router({
  listarPublicos: publicProcedure.query(async () => db
    .select({ id: fraccionamientos.id, nombre: fraccionamientos.nombre })
    .from(fraccionamientos)
    .where(eq(fraccionamientos.activo, true))
    .orderBy(fraccionamientos.nombre)),

  listar: roleProcedure('admin').query(async () => db
    .select({
      id: fraccionamientos.id,
      nombre: fraccionamientos.nombre,
      slug: fraccionamientos.slug,
      activo: fraccionamientos.activo,
      representanteId: fraccionamientos.representanteId,
      tesoreraId: fraccionamientos.tesoreraId,
      montoMensual: fraccionamientos.montoMensual,
      montoReconexion: fraccionamientos.montoReconexion,
      diaCorte: fraccionamientos.diaCorte,
      mercadoPagoConfigurado: sql<boolean>`coalesce(${fraccionamientoMetodosPago.accessTokenCifrado} <> '' AND ${fraccionamientoMetodosPago.collectorId} IS NOT NULL, false)`,
    })
    .from(fraccionamientos)
    .leftJoin(fraccionamientoMetodosPago, and(
      eq(fraccionamientoMetodosPago.fraccionamientoId, fraccionamientos.id),
      eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
      eq(fraccionamientoMetodosPago.activo, true),
    ))
    .orderBy(fraccionamientos.nombre)),

  crear: roleProcedure('admin')
    .input(z.object({
      nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(160),
      montoMensual: z.number().min(0).default(50),
      montoReconexion: z.number().min(0).default(300),
      diaCorte: z.number().int().min(1).max(28).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const slug = slugifyFraccionamiento(input.nombre);

      try {
        return await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: fraccionamientos.id })
            .from(fraccionamientos)
            .where(eq(fraccionamientos.slug, slug))
            .limit(1);

          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Ya existe un fraccionamiento con un nombre similar',
            });
          }

          const [created] = await tx
            .insert(fraccionamientos)
            .values({
              nombre: input.nombre,
              slug,
              activo: true,
              montoMensual: input.montoMensual.toFixed(2),
              montoReconexion: input.montoReconexion.toFixed(2),
              diaCorte: input.diaCorte,
            })
            .returning({
              id: fraccionamientos.id,
              nombre: fraccionamientos.nombre,
              slug: fraccionamientos.slug,
              activo: fraccionamientos.activo,
            });

          if (!created) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo crear el fraccionamiento' });
          }

          await tx.insert(auditoria).values({
            actorId: ctx.user.id,
            accion: 'fraccionamiento.creado',
            entidad: 'fraccionamientos',
            entidadId: created.id,
            detalle: { nombre: created.nombre, slug: created.slug },
          });

          return created;
        });
      } catch (error) {
        // La restricción UNIQUE sigue siendo la última defensa ante dos altas
        // simultáneas que generen el mismo slug.
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ya existe un fraccionamiento con un nombre similar',
          });
        }
        throw error;
      }
    }),

  actualizarConfiguracion: roleProcedure('admin')
    .input(z.object({
      fraccionamientoId: z.string().uuid(),
      montoMensual: z.number().min(0),
      montoReconexion: z.number().min(0),
      diaCorte: z.number().int().min(1).max(28),
      activo: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(fraccionamientos).set({
        montoMensual: input.montoMensual.toFixed(2),
        montoReconexion: input.montoReconexion.toFixed(2),
        diaCorte: input.diaCorte,
        activo: input.activo,
        updatedAt: new Date(),
      }).where(eq(fraccionamientos.id, input.fraccionamientoId)).returning({ id: fraccionamientos.id });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fraccionamiento no encontrado' });
      await db.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: 'fraccionamiento.configuracion_actualizada',
        entidad: 'fraccionamientos',
        entidadId: updated.id,
        detalle: {
          montoMensual: input.montoMensual,
          montoReconexion: input.montoReconexion,
          diaCorte: input.diaCorte,
          activo: input.activo,
        },
      });
      return { ok: true };
    }),

  cambiarEstado: roleProcedure('admin')
    .input(z.object({ fraccionamientoId: z.string().uuid(), activo: z.boolean() }))
    .mutation(async ({ ctx, input }) => db.transaction(async (tx) => {
      const [updated] = await tx.update(fraccionamientos).set({
        activo: input.activo,
        updatedAt: new Date(),
      }).where(eq(fraccionamientos.id, input.fraccionamientoId)).returning({
        id: fraccionamientos.id,
        nombre: fraccionamientos.nombre,
        activo: fraccionamientos.activo,
      });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fraccionamiento no encontrado' });
      if (!input.activo) {
        const usuariosDelFraccionamiento = tx.select({ id: user.id })
          .from(user)
          .where(eq(user.fraccionamientoId, updated.id));
        await tx.delete(session).where(inArray(session.userId, usuariosDelFraccionamiento));
      }
      await tx.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: input.activo ? 'fraccionamiento.activado' : 'fraccionamiento.desactivado',
        entidad: 'fraccionamientos',
        entidadId: updated.id,
        detalle: { nombre: updated.nombre },
      });
      return updated;
    })),

  eliminar: roleProcedure('admin')
    .input(z.object({ fraccionamientoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => db.transaction(async (tx) => {
      const [tenant] = await tx.select({ id: fraccionamientos.id, nombre: fraccionamientos.nombre })
        .from(fraccionamientos).where(eq(fraccionamientos.id, input.fraccionamientoId)).limit(1);
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fraccionamiento no encontrado' });

      const [[usuarios], [perfiles], [pagosExistentes], [cargos], [ordenes]] = await Promise.all([
        tx.select({ total: count() }).from(user).where(eq(user.fraccionamientoId, tenant.id)),
        tx.select({ total: count() }).from(perfilesResidente).where(eq(perfilesResidente.fraccionamientoId, tenant.id)),
        tx.select({ total: count() }).from(pagos).where(eq(pagos.fraccionamientoId, tenant.id)),
        tx.select({ total: count() }).from(cargosServicios).where(eq(cargosServicios.fraccionamientoId, tenant.id)),
        tx.select({ total: count() }).from(ordenesTrabajo).where(eq(ordenesTrabajo.fraccionamientoId, tenant.id)),
      ]);
      if ([usuarios, perfiles, pagosExistentes, cargos, ordenes].some(row => Number(row?.total ?? 0) > 0)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se puede eliminar un fraccionamiento con usuarios u operaciones. Desactivalo para bloquearlo.',
        });
      }

      await tx.delete(suscripcionesFraccionamiento).where(eq(suscripcionesFraccionamiento.fraccionamientoId, tenant.id));
      const [deleted] = await tx.delete(fraccionamientos).where(eq(fraccionamientos.id, tenant.id))
        .returning({ id: fraccionamientos.id });
      if (!deleted) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo eliminar el fraccionamiento' });
      await tx.insert(auditoria).values({
        actorId: ctx.user.id,
        accion: 'fraccionamiento.eliminado',
        entidad: 'fraccionamientos',
        entidadId: tenant.id,
        detalle: { nombre: tenant.nombre },
      });
      return { ok: true };
    })),

  actualizarMercadoPago: roleProcedure('admin')
    .input(z.object({
      fraccionamientoId: z.string().uuid(),
      // Omitirlo conserva el token cifrado existente; nunca se devuelve al cliente.
      accessToken: z.string().trim().min(10).max(500).optional(),
      collectorId: z.string().trim().regex(/^\d+$/, 'El Collector ID debe contener solo dígitos').max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.query.fraccionamientoMetodosPago.findFirst({
        columns: { accessTokenCifrado: true },
        where: and(
          eq(fraccionamientoMetodosPago.fraccionamientoId, input.fraccionamientoId),
          eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
        ),
      });
      if (!existing?.accessTokenCifrado && !input.accessToken) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El Access Token es obligatorio al configurar Mercado Pago por primera vez' });
      }

      const encryptedAccessToken = input.accessToken ? encryptToken(input.accessToken) : undefined;
      await db.transaction(async (tx) => {
        const [tenant] = await tx.select({ id: fraccionamientos.id }).from(fraccionamientos)
          .where(and(eq(fraccionamientos.id, input.fraccionamientoId), eq(fraccionamientos.activo, true))).limit(1);
        if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fraccionamiento no encontrado o inactivo' });

        await tx.insert(fraccionamientoMetodosPago).values({
          fraccionamientoId: input.fraccionamientoId,
          proveedor: 'mercado_pago',
          accessTokenCifrado: encryptedAccessToken ?? existing!.accessTokenCifrado,
          collectorId: input.collectorId,
          activo: true,
        }).onConflictDoUpdate({
          target: [fraccionamientoMetodosPago.fraccionamientoId, fraccionamientoMetodosPago.proveedor],
          set: {
            ...(encryptedAccessToken ? { accessTokenCifrado: encryptedAccessToken } : {}),
            collectorId: input.collectorId,
            activo: true,
            actualizadoEn: new Date(),
          },
        });
        await tx.insert(auditoria).values({
          actorId: ctx.user.id,
          accion: 'fraccionamiento.mercado_pago_actualizado',
          entidad: 'fraccionamiento_metodos_pago',
          entidadId: input.fraccionamientoId,
          detalle: { proveedor: 'mercado_pago', tokenActualizado: Boolean(encryptedAccessToken) },
        });
      });
      return { ok: true };
    }),
});
