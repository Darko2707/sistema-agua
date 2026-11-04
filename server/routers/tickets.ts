import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { ticketRepo } from '@/src/infrastructure/db/repositories';
import { TRPCError } from '@trpc/server';
import { buildTransferReceiptItems, sumTransferReceiptItems } from '@/lib/transfer-receipt';

export const ticketsRouter = router({
  // ✅ Verificación pública (sin autenticación)
  verificar: publicProcedure
    .input(z.object({ folio: z.string().trim().min(4).max(64).regex(/^[A-Z0-9-]+$/i) }))
    .query(async ({ input }) => {
      const ticket = await ticketRepo.findByFolio(input.folio);
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
    const perfil = await ticketRepo.findResidentProfile(ctx.user.id);
    if (!perfil) return [];
    if (perfil.fraccionamientoId !== ctx.user.fraccionamientoId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'El perfil no pertenece a tu fraccionamiento' });
    }

    const misPagos = await ticketRepo.findPaidPayments(perfil.id, ctx.user.fraccionamientoId!);
    const ids = misPagos.map((p) => p.id);
    const misCargos = await ticketRepo.findPaidServiceCharges(perfil.id, ctx.user.fraccionamientoId!);
    const cargoIds = misCargos.map((c) => c.id);
    if (ids.length === 0 && cargoIds.length === 0) return [];

    const rows = await ticketRepo.findTicketsForPaymentsOrCharges(ids, cargoIds);
    const transferenciasAprobadas = await ticketRepo.findApprovedTransfers(perfil.id, ctx.user.fraccionamientoId!);

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
    const comprobantesList = await ticketRepo.findApprovedProofsByPaymentIds(pagoIds);
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
