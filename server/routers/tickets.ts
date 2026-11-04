import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
// eslint-disable-next-line no-restricted-imports -- relational ticket queries not yet in a repo
import { db } from '@/db';
import { comprobantesTransferencia } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { buildTransferReceiptItems, sumTransferReceiptItems } from '@/lib/transfer-receipt';

export const ticketsRouter = router({
  // ✅ Verificación pública (sin autenticación)
  verificar: publicProcedure
    .input(z.object({ folio: z.string().trim().min(4).max(64).regex(/^[A-Z0-9-]+$/i) }))
    .query(async ({ input }) => {
      const ticket = await db.query.tickets.findFirst({
        where: (t, { eq }) => eq(t.folio, input.folio),
        columns: {
          folio: true,
          tipo: true,
          emitidoEn: true,
        },
        with: {
          cargoServicio: {
            columns: {
              mes: true,
              anio: true,
              monto: true,
              estado: true,
            },
          },
          pago: {
            columns: {
              mes: true,
              anio: true,
              monto: true,
              estado: true,
              fechaPago: true,
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
          } : null,
        cargoServicio: ticket.cargoServicio ? {
          mes: ticket.cargoServicio.mes,
          anio: ticket.cargoServicio.anio,
          monto: ticket.cargoServicio.monto,
          estado: ticket.cargoServicio.estado,
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
        eq(p.estado, 'pagado'),
      ),
    });
    const ids = misPagos.map((p) => p.id);
    const misCargos = await db.query.cargosServicios.findMany({
      where: (c, { eq, and }) => and(
        eq(c.perfilId, perfil.id),
        eq(c.fraccionamientoId, ctx.user.fraccionamientoId!),
        eq(c.estado, 'pagado'),
      ),
      with: {
        fraccionamientoServicio: {
          with: { servicio: { columns: { nombre: true } } },
        },
      },
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
          with: {
            fraccionamientoServicio: {
              columns: {},
              with: { servicio: { columns: { nombre: true } } },
            },
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

    const transferenciasAprobadas = await db.select({
      id: comprobantesTransferencia.id,
      monto: comprobantesTransferencia.monto,
      fechaEmision: comprobantesTransferencia.fechaEmision,
      fechaRevision: comprobantesTransferencia.fechaRevision,
      metadatos: comprobantesTransferencia.metadatos,
    }).from(comprobantesTransferencia).where(and(
      eq(comprobantesTransferencia.perfilId, perfil.id),
      eq(comprobantesTransferencia.fraccionamientoId, ctx.user.fraccionamientoId!),
      eq(comprobantesTransferencia.estado, 'aprobado'),
    ));

    const transferPeriodKeys = new Set<string>();
    const transferCargoIds = new Set<string>();
    const transferReceipts = transferenciasAprobadas.flatMap((transfer) => {
      const meses = transfer.metadatos?.meses ?? [];
      const cargosSeleccionados = transfer.metadatos?.cargosAcreditadosIds
        ?? transfer.metadatos?.cargosServicioIds
        ?? [];
      const conceptos = buildTransferReceiptItems({
        mesesSeleccionados: meses,
        pagos: misPagos.map(({ mes, anio, monto, estado, esReconexion }) => ({ mes, anio, monto, estado, esReconexion })),
        cargosSeleccionados,
        cargos: misCargos.map(cargo => ({
          id: cargo.id,
          mes: cargo.mes,
          anio: cargo.anio,
          monto: cargo.monto,
          estado: cargo.estado,
          servicioNombre: cargo.fraccionamientoServicio?.servicio?.nombre ?? 'Servicio',
        })),
      });
      if (conceptos.length === 0) return [];

      for (const item of conceptos) {
        if (item.tipo === 'agua') transferPeriodKeys.add(`${item.anio}-${item.mes}`);
      }
      for (const cargoId of cargosSeleccionados) {
        if (misCargos.some(cargo => cargo.id === cargoId && cargo.estado === 'pagado')) transferCargoIds.add(cargoId);
      }

      const emittedAt = transfer.fechaRevision ?? transfer.fechaEmision;
      return [{
        id: `transferencia-${transfer.id}`,
        folio: `TRF${transfer.id.replaceAll('-', '').toUpperCase()}`,
        tipo: 'transferencia' as const,
        emitidoEn: emittedAt,
        transferencia: {
          id: transfer.id,
          anio: conceptos[0]!.anio,
          monto: sumTransferReceiptItems(conceptos),
          conceptos,
        },
      }];
    });

    // Enrich tickets whose pago was paid by transferencia with comprobante info
    const pagoIds = rows.map(t => t.pago?.id).filter(Boolean) as string[];
    const comprobantesList = pagoIds.length > 0
      ? await db
          .select({
            id:             comprobantesTransferencia.id,
            pagoId:         comprobantesTransferencia.pagoId,
            monto:          comprobantesTransferencia.monto,
            concepto:       comprobantesTransferencia.concepto,
            comprobanteUrl: comprobantesTransferencia.comprobanteUrl,
          })
          .from(comprobantesTransferencia)
          .where(and(
            inArray(comprobantesTransferencia.pagoId, pagoIds),
            eq(comprobantesTransferencia.estado, 'aprobado'),
          ))
      : [];
    const comprobanteByPago = new Map(comprobantesList.map(c => [c.pagoId, c]));

    const ticketsIndividuales = rows
      .filter(ticket => {
        if (ticket.pago && transferPeriodKeys.has(`${ticket.pago.anio}-${ticket.pago.mes}`)) return false;
        if (ticket.cargoServicio && transferCargoIds.has(ticket.cargoServicio.id)) return false;
        return true;
      })
      .map(ticket => {
      const comp = ticket.pago?.id ? comprobanteByPago.get(ticket.pago.id) : undefined;
      return {
        ...ticket,
        tipo: ticket.tipo,
        cargoServicio: ticket.cargoServicio ? {
          ...ticket.cargoServicio,
          montoTotalCobrado: ticket.cargoServicio.monto,
        } : null,
        pago: ticket.pago ? {
          ...ticket.pago,
          montoServicio: ticket.pago.montoBase ?? ticket.pago.monto,
          montoTotalCobrado: ticket.pago.monto,
          montoTotalEfectivo: comp ? comp.monto : null,
          desgloseConceptos:  comp ? comp.concepto : null,
          comprobanteUrl:     comp ? comp.comprobanteUrl : null,
          comprobanteId:      comp ? comp.id : null,
        } : null,
      };
      });
    return [...transferReceipts, ...ticketsIndividuales].sort((a, b) =>
      new Date(b.emitidoEn ?? 0).getTime() - new Date(a.emitidoEn ?? 0).getTime(),
    );
  }),
});
