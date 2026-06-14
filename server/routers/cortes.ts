import { router, protectedProcedure, roleProcedure } from '../trpc'
import { z } from 'zod'
import { db } from '@/db'
import { cortes, perfilesResidente } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

export const cortesRouter = router({

  // Cuadrilla de cortes: lista de cortes activos pendientes de reconectar
  // (un corte sigue "activo" hasta que la cuadrilla confirma la reconexión física)
  listarActivos: roleProcedure('cuadrilla_cortes', 'admin').query(async () => {
    return db.query.cortes.findMany({
      where: (c, { eq }) => eq(c.activo, true),
      with: { perfil: { with: { usuario: true, circuito: true } } },
      orderBy: (c, { desc }) => [desc(c.fechaCorte)],
    })
  }),

  // Cuadrilla: historial de reconexiones recientes
  reconectadosHoy: roleProcedure('cuadrilla_cortes', 'admin').query(async () => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    return db.query.cortes.findMany({
      where: (c, { eq, and, gte }) => and(eq(c.activo, false), gte(c.fechaReconexion, hoy)),
      with: { perfil: { with: { usuario: true, circuito: true } } },
      orderBy: (c, { desc }) => [desc(c.fechaReconexion)],
    })
  }),

  // Cuadrilla: confirma que reconectó físicamente el servicio
  confirmarReconexion: roleProcedure('cuadrilla_cortes', 'admin')
    .input(z.object({ corteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const corte = await db.query.cortes.findFirst({
        where: (c, { eq }) => eq(c.id, input.corteId),
      })
      if (!corte) throw new TRPCError({ code: 'NOT_FOUND' })

      await db.update(cortes)
        .set({
          activo: false,
          fechaReconexion: new Date(),
          reconectadoPor: ctx.user.id,
        })
        .where(eq(cortes.id, input.corteId))

      await db.update(perfilesResidente)
        .set({ estadoAgua: 'activo' })
        .where(eq(perfilesResidente.id, corte.perfilId))

      return { ok: true }
    }),

  // Operador de pozo / admin: corte manual (ej. mantenimiento, fuga, etc.)
  crearCorteManual: roleProcedure('operador_pozo', 'admin')
    .input(z.object({
      perfilId: z.string().uuid(),
      motivo: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const yaActivo = await db.query.cortes.findFirst({
        where: (c, { eq, and }) => and(eq(c.perfilId, input.perfilId), eq(c.activo, true)),
      })
      if (yaActivo) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya tiene un corte activo' })

      const [corte] = await db.insert(cortes).values({
        perfilId: input.perfilId,
        trabajadorId: ctx.user.id,
        motivo: input.motivo,
        activo: true,
      }).returning()

      await db.update(perfilesResidente)
        .set({ estadoAgua: 'cortado' })
        .where(eq(perfilesResidente.id, input.perfilId))

      return corte
    }),

  // Resumen para admin/operador: estado de cortes
  resumen: roleProcedure('admin', 'operador_pozo').query(async () => {
    const activos = await db.query.cortes.findMany({
      where: (c, { eq }) => eq(c.activo, true),
    })
    return { totalActivos: activos.length }
  }),
})