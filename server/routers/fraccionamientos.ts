import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { db } from '@/db';
import { auditoria, fraccionamientos } from '@/db/schema';
import { router, roleProcedure } from '../trpc';

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
  listar: roleProcedure('admin').query(async () => db
    .select({ id: fraccionamientos.id, nombre: fraccionamientos.nombre, slug: fraccionamientos.slug, activo: fraccionamientos.activo })
    .from(fraccionamientos)
    .where(eq(fraccionamientos.activo, true))
    .orderBy(fraccionamientos.nombre)),

  crear: roleProcedure('admin')
    .input(z.object({
      nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(160),
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
            .values({ nombre: input.nombre, slug, activo: true })
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
});
