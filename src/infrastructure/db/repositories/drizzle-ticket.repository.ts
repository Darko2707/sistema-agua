import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { comprobantesTransferencia, tickets } from '@/db/schema';

/** SQL access for receipt/ticket queries; tenant filters belong here with the query. */
export class DrizzleTicketRepository {
  findByFolio(folio: string) {
    return db.query.tickets.findFirst({
      where: (ticket, { eq }) => eq(ticket.folio, folio),
      columns: { folio: true, tipo: true, emitidoEn: true },
      with: {
        cargoServicio: { columns: { mes: true, anio: true, monto: true, estado: true } },
        pago: { columns: { mes: true, anio: true, monto: true, estado: true, fechaPago: true } },
      },
    });
  }

  findResidentProfile(userId: string) {
    return db.query.perfilesResidente.findFirst({
      where: (profile, { eq }) => eq(profile.userId, userId),
    });
  }

  findPaidPayments(profileId: string, tenantId: string) {
    return db.query.pagos.findMany({
      where: (payment, { eq, and }) => and(
        eq(payment.perfilId, profileId), eq(payment.fraccionamientoId, tenantId), eq(payment.estado, 'pagado'),
      ),
    });
  }

  findPaidServiceCharges(profileId: string, tenantId: string) {
    return db.query.cargosServicios.findMany({
      where: (charge, { eq, and }) => and(
        eq(charge.perfilId, profileId), eq(charge.fraccionamientoId, tenantId), eq(charge.estado, 'pagado'),
      ),
      with: { fraccionamientoServicio: { with: { servicio: { columns: { nombre: true } } } } },
    });
  }

  findTicketsForPaymentsOrCharges(paymentIds: string[], chargeIds: string[]) {
    const predicates = [
      ...(paymentIds.length ? [inArray(tickets.pagoId, paymentIds)] : []),
      ...(chargeIds.length ? [inArray(tickets.cargoServicioId, chargeIds)] : []),
    ];
    if (!predicates.length) return Promise.resolve([]);
    return db.query.tickets.findMany({
      where: (_ticket, { or }) => or(...predicates),
      with: {
        cargoServicio: {
          columns: { id: true, mes: true, anio: true, monto: true, estado: true, metodo: true, folio: true },
          with: { fraccionamientoServicio: { columns: {}, with: { servicio: { columns: { nombre: true } } } } },
        },
        pago: {
          columns: {
            id: true, mes: true, anio: true, monto: true, montoBase: true, comisionMercadoPago: true,
            retencionIsr: true, retencionIva: true, estado: true, metodo: true, folio: true,
            fechaPago: true, esReconexion: true,
          },
          with: {
            perfil: {
              columns: { id: true, edificio: true, departamento: true },
              with: { usuario: { columns: { id: true, name: true, email: true } } },
            },
          },
        },
      },
      orderBy: (ticket, { desc }) => [desc(ticket.emitidoEn)],
    });
  }

  findApprovedTransfers(profileId: string, tenantId: string) {
    return db.select({
      id: comprobantesTransferencia.id, monto: comprobantesTransferencia.monto,
      fechaEmision: comprobantesTransferencia.fechaEmision,
      fechaRevision: comprobantesTransferencia.fechaRevision,
      metadatos: comprobantesTransferencia.metadatos,
    }).from(comprobantesTransferencia).where(and(
      eq(comprobantesTransferencia.perfilId, profileId),
      eq(comprobantesTransferencia.fraccionamientoId, tenantId),
      eq(comprobantesTransferencia.estado, 'aprobado'),
    ));
  }

  findApprovedProofsByPaymentIds(paymentIds: string[]) {
    if (!paymentIds.length) return Promise.resolve([]);
    return db.select({
      id: comprobantesTransferencia.id, pagoId: comprobantesTransferencia.pagoId,
      monto: comprobantesTransferencia.monto, concepto: comprobantesTransferencia.concepto,
      comprobanteUrl: comprobantesTransferencia.comprobanteUrl,
    }).from(comprobantesTransferencia).where(and(
      inArray(comprobantesTransferencia.pagoId, paymentIds),
      eq(comprobantesTransferencia.estado, 'aprobado'),
    ));
  }
}

