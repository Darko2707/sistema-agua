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
          cargoServicio: true,
          pago: {
            columns: {
              mes: true, anio: true, monto: true, estado: true, fechaPago: true, metodo: true,
            },
          },
        },
      });
      if (!ticket) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket no válido' });
      return {
        folio: ticket.folio,
        tipo: ticket.tipo,
        emitidoEn: ticket.emitidoEn,
        pago: ticket.pago ? {
          mes:       ticket.pago.mes,
          anio:      ticket.pago.anio,
          monto:     ticket.pago.monto,
          estado:    ticket.pago.estado,
          fechaPago: ticket.pago.fechaPago,
          metodo:    ticket.pago.metodo,
          } : null,
        cargoServicio: ticket.cargoServicio ? {
          id: ticket.cargoServicio.id,
          mes: ticket.cargoServicio.mes,
          anio: ticket.cargoServicio.anio,
          monto: ticket.cargoServicio.monto,
          estado: ticket.cargoServicio.estado,
          metodo: ticket.cargoServicio.metodo,
          folio: ticket.cargoServicio.folio,
        } : null,
      };
    }),

  // Mis tickets (para residentes autenticados)
  misTickets: protectedProcedure.query(async ({ ctx }) => {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, ctx.user.id),
    });
    if (!perfil) return [];
    if (perfil.fraccionamientoId !== ctx.user.fraccionamientoId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El perfil no pertenece a tu fraccionamiento' });
    }

    const misPagos = await db.query.pagos.findMany({
      where: (p, { eq, and }) => and(
        eq(p.perfilId, perfil.id),
        eq(p.fraccionamientoId, ctx.user.fraccionamientoId!),
      ),
    });
    const ids = misPagos.map((p) => p.id);
    const misCargos = await db.query.cargosServicios.findMany({
      where: (c, { eq, and }) => and(
        eq(c.perfilId, perfil.id),
        eq(c.fraccionamientoId, ctx.user.fraccionamientoId!),
      ),
    });
    const cargoIds = misCargos.map((c) => c.id);
    if (ids.length === 0 && cargoIds.length === 0) return [];

    const rows = await db.query.tickets.findMany({
      where: (t, { inArray, or }) => or(
        ...(ids.length ? [inArray(t.pagoId, ids)] : []),
        ...(cargoIds.length ? [inArray(t.cargoServicioId, cargoIds)] : []),
      ),
      with: {
        cargoServicio: {
          columns: {
            id: true,
            mes: true,
            anio: true,
            monto: true,
            estado: true,
            metodo: true,
            folio: true,
          },
        },
        pago: {
          columns: {
            id: true,
            mes: true,
            anio: true,
            monto: true,
            montoBase: true,
            comisionMercadoPago: true,
            retencionIsr: true,
            retencionIva: true,
            estado: true,
            metodo: true,
            folio: true,
            fechaPago: true,
            esReconexion: true,
          },
          with: {
            circuito: {
              columns: {
                id: true,
                nombre: true,
                montoMensual: true,
                montoReconexion: true,
                activo: true,
              },
            },
            perfil: {
              columns: { id: true, edificio: true, departamento: true },
              with: {
                usuario: { columns: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: (t, { desc }) => [desc(t.emitidoEn)],
    });
    return rows.map(ticket => ({
      ...ticket,
      tipo: ticket.tipo,
      cargoServicio: ticket.cargoServicio ? {
        ...ticket.cargoServicio,
        montoTotalCobrado: ticket.cargoServicio.monto,
      } : null,
      pago: ticket.pago ? {
        ...ticket.pago,
        montoCircuito: ticket.pago.montoBase ?? ticket.pago.monto,
        montoTotalCobrado: ticket.pago.monto,
      } : null,
    }));
  }),
});
