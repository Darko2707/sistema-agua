// server/routers/circuitos.ts (CREAR si no existe)
import { router, roleProcedure } from '../trpc';
import { z } from 'zod';
import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const circuitosRouter = router({
  // Listar todos los circuitos
  listar: roleProcedure('admin').query(async () => {
    return db.query.circuitos.findMany({
      orderBy: (c, { asc }) => [asc(c.nombre)],
    });
  }),

  // ✅ NUEVO: Toggle activo/inactivo
  toggleActivo: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      activo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await db.update(circuitos)
        .set({ activo: input.activo })
        .where(eq(circuitos.id, input.circuitoId));
      
      return { ok: true };
    }),

  // Actualizar montos
  actualizarMontos: roleProcedure('admin')
    .input(z.object({
      circuitoId: z.string().uuid(),
      montoMensual: z.number().positive(),
      montoReconexion: z.number().positive(),
    }))
    .mutation(async ({ input }) => {
      await db.update(circuitos)
        .set({
          montoMensual: String(input.montoMensual),
          montoReconexion: String(input.montoReconexion),
        })
        .where(eq(circuitos.id, input.circuitoId));
      
      return { ok: true };
    }),
});