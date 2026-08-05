import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
// eslint-disable-next-line no-restricted-imports -- relational ticket queries not yet in a repo
import { db } from '@/db';
import { TRPCError } from '@trpc/server';

export const ticketsRouter = router({
  // ✅ Verificación pública (sin autenticación)
  verificar: publicProcedure
    .input(z.object({ folio: z.string().trim().min(4).max(64).regex(/^[A-Z0-9-]+$/i) }))
    .query(async ({ input }) => {
      const ticket = await db.query.tickets.findFirst({
        where: (t, { eq }) => eq(t.folio, input.folio),
        with: {
          pago: {
            columns: {
              mes: true, anio: true, monto: true, estado: true, fechaPago: true, metodo: true,
            },
            with: {
              perfil: {
                columns: { edificio: true, departamento: true },
                with: { usuario: { columns: { name: true } } },
              },
            },
          },
        },
      });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket no válido' });
      return {
        folio: ticket.folio,
        emitidoEn: ticket.emitidoEn,
        pago: ticket.pago ? {
          mes:       ticket.pago.mes,
          anio:      ticket.pago.anio,
          monto:     ticket.pago.monto,
          estado:    ticket.pago.estado,
          fechaPago: ticket.pago.fechaPago,
          metodo:    ticket.pago.metodo,
          perfil: ticket.pago.perfil ? {
            edificio:     ticket.pago.perfil.edificio,
            departamento: ticket.pago.perfil.departamento,
            usuario:      { name: ticket.pago.perfil.usuario?.name ?? null },
          } : null,
        } : null,
      };
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
