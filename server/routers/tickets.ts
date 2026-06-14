import { router, protectedProcedure } from '../trpc'
import { z } from 'zod'
import { db } from '@/db'
import { TRPCError } from '@trpc/server'

export const ticketsRouter = router({

  // Verificación pública por folio (usada por la página de QR)
  verificar: protectedProcedure
    .input(z.object({ folio: z.string() }))
    .query(async ({ input }) => {
      const ticket = await db.query.tickets.findFirst({
        where: (t, { eq }) => eq(t.folio, input.folio),
        with: {
          pago: {
            with: { perfil: { with: { usuario: true } } },
          },
        },
      })
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket no válido' })
      return ticket
    }),

  misTickets: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    })
    if (!perfil) return []

    const misPagos = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
    })
    const ids = misPagos.map(p => p.id)
    if (ids.length === 0) return []

    return db.query.tickets.findMany({
      where: (t, { inArray }) => inArray(t.pagoId, ids),
      orderBy: (t, { desc }) => [desc(t.emitidoEn)],
    })
  }),
  })