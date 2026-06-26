import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
// eslint-disable-next-line no-restricted-imports -- relational ticket queries not yet in a repo
import { db } from '@/db';
import { TRPCError } from '@trpc/server';

export const ticketsRouter = router({
  // ✅ Verificación pública (sin autenticación)
  verificar: publicProcedure
    .input(z.object({ folio: z.string() }))
    .query(async ({ input }) => {
      const ticket = await db.query.tickets.findFirst({
        where: (t, { eq }) => eq(t.folio, input.folio),
        with: {
          pago: {
            with: { perfil: { with: { usuario: true } } },
          },
        },
      });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket no válido' });
      return ticket;
    }),

  // Mis tickets (para residentes autenticados)
  misTickets: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    });
    if (!perfil) return [];

    const misPagos = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
    });
    const ids = misPagos.map((p) => p.id);
    if (ids.length === 0) return [];

    return db.query.tickets.findMany({
      where: (t, { inArray }) => inArray(t.pagoId, ids),
      with: {
        pago: {
          with: {
            circuito: true,
            perfil: {
              with: {
                usuario: true,
              },
            },
          },
        },
      },
      orderBy: (t, { desc }) => [desc(t.emitidoEn)],
    });
  }),
});
