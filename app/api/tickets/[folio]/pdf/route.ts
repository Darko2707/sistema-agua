import { and, eq, inArray } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { cargosServicios, comprobantesTransferencia, fraccionamientos, fraccionamientoServicios, pagos, perfilesResidente, servicios, tickets, user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { guardTicketPdf } from '@/lib/ticket-pdf-guard';
import { generarReciboTransferenciaPDF, generarTicketPDF } from '@/server/services/pdf';
import { VercelBlobAdapter } from '@/src/infrastructure/storage/vercel-blob.adapter';
import { buildTransferReceiptItems, sumTransferReceiptItems } from '@/lib/transfer-receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storage = new VercelBlobAdapter();

function pdfResponse(pdf: Buffer, folio: string): Response {
  return new Response(Uint8Array.from(pdf), {
    headers: {
      'Content-Type':            'application/pdf',
      'Content-Disposition':     `attachment; filename="recibo-${folio}.pdf"`,
      'Content-Length':          String(pdf.byteLength),
      'Cache-Control':           'private, no-store',
      'X-Content-Type-Options':  'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Referrer-Policy':         'no-referrer',
    },
  });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ folio: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const ticketGuard = await guardTicketPdf(session.user.id);
  if (!ticketGuard.allowed) return ticketGuard.response;

  try {

  const { folio: rawFolio } = await ctx.params;
  if (!/^[A-Z0-9-]{4,64}$/i.test(rawFolio)) {
    return Response.json({ error: 'Folio inválido' }, { status: 400 });
  }
  const folio = rawFolio.toUpperCase();

  if (/^TRF[A-F0-9]{32}$/.test(folio)) {
    const comprobanteId = `${folio.slice(3, 11)}-${folio.slice(11, 15)}-${folio.slice(15, 19)}-${folio.slice(19, 23)}-${folio.slice(23)}`.toLowerCase();
    const [transfer] = await db.select({
      id: comprobantesTransferencia.id,
      monto: comprobantesTransferencia.monto,
      metadatos: comprobantesTransferencia.metadatos,
      fechaEmision: comprobantesTransferencia.fechaEmision,
      fechaRevision: comprobantesTransferencia.fechaRevision,
      perfilId: comprobantesTransferencia.perfilId,
      residenteUserId: user.id,
      residenteNombre: user.name,
      edificio: perfilesResidente.edificio,
      departamento: perfilesResidente.departamento,
      fraccionamientoId: fraccionamientos.id,
      fraccionamientoNombre: fraccionamientos.nombre,
      representanteId: fraccionamientos.representanteId,
    }).from(comprobantesTransferencia)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, comprobantesTransferencia.perfilId))
      .innerJoin(user, eq(user.id, perfilesResidente.userId))
      .innerJoin(fraccionamientos, eq(fraccionamientos.id, comprobantesTransferencia.fraccionamientoId))
      .where(and(
        eq(comprobantesTransferencia.id, comprobanteId),
        eq(comprobantesTransferencia.estado, 'aprobado'),
      )).limit(1);
    if (!transfer) return Response.json({ error: 'Recibo de transferencia no encontrado' }, { status: 404 });

    const usuario = await db.query.user.findFirst({
      where: (userTable, { eq: equals }) => equals(userTable.id, session.user.id),
      columns: { role: true },
    });
    const role = usuario?.role ?? 'residente';
    const esDuenio = transfer.residenteUserId === session.user.id;
    const esAdmin = role === 'admin';
    const esRepresentante = role === 'representante' && transfer.representanteId === session.user.id;
    if (!esDuenio && !esAdmin && !esRepresentante) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const meses = transfer.metadatos?.meses ?? [];
    const cargosSeleccionados = transfer.metadatos?.cargosAcreditadosIds
      ?? transfer.metadatos?.cargosServicioIds
      ?? [];
    const pagosPagados = await db.select({
      mes: pagos.mes,
      anio: pagos.anio,
      monto: pagos.monto,
      estado: pagos.estado,
      esReconexion: pagos.esReconexion,
    }).from(pagos).where(and(
      eq(pagos.perfilId, transfer.perfilId),
      eq(pagos.fraccionamientoId, transfer.fraccionamientoId),
      eq(pagos.estado, 'pagado'),
    ));
    const cargosPagados = cargosSeleccionados.length > 0
      ? await db.select({
          id: cargosServicios.id,
          mes: cargosServicios.mes,
          anio: cargosServicios.anio,
          monto: cargosServicios.monto,
          estado: cargosServicios.estado,
          servicioNombre: servicios.nombre,
        }).from(cargosServicios)
          .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
          .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
          .where(and(
            eq(cargosServicios.fraccionamientoId, transfer.fraccionamientoId),
            eq(cargosServicios.perfilId, transfer.perfilId),
            eq(cargosServicios.estado, 'pagado'),
            inArray(cargosServicios.id, cargosSeleccionados),
          ))
      : [];
    const conceptos = buildTransferReceiptItems({
      mesesSeleccionados: meses,
      pagos: pagosPagados,
      cargosSeleccionados,
      cargos: cargosPagados,
    });
    if (conceptos.length === 0) return Response.json({ error: 'La transferencia no tiene conceptos pagados para emitir un recibo' }, { status: 409 });

    const pdf = await generarReciboTransferenciaPDF({
      folio,
      fraccionamiento: transfer.fraccionamientoNombre,
      nombre: transfer.residenteNombre ?? 'Residente',
      edificio: transfer.edificio,
      departamento: transfer.departamento,
      emitidoEn: transfer.fechaRevision ?? transfer.fechaEmision,
      conceptos,
      montoTotal: sumTransferReceiptItems(conceptos),
    });
    return pdfResponse(pdf, folio);
  }

  const ticket = await db.query.tickets.findFirst({
    where: (ticketTable, { eq: equals }) => equals(ticketTable.folio, folio),
    columns: {
      folio: true,
      pdfUrl: true,
    },
    with: {
      pago: {
        columns: {
          estado: true,
          mes: true,
          anio: true,
          monto: true,
          montoBase: true,
          iva: true,
          comisionMercadoPago: true,
          retencionIsr: true,
          retencionIva: true,
          esReconexion: true,
        },
        with: {
          fraccionamiento: {
            columns: {
              nombre: true,
              representanteId: true,
            },
          },
          perfil: {
            columns: {
              userId: true,
              edificio: true,
              departamento: true,
            },
            with: {
              usuario: { columns: { name: true } },
            },
          },
        },
      },
      cargoServicio: {
        columns: {
          id: true,
          estado: true,
        },
      },
    },
  });

  if (!ticket) {
    return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
  }

  const usuario = await db.query.user.findFirst({
    where: (userTable, { eq: equals }) => equals(userTable.id, session.user.id),
    columns: { role: true },
  });
  const role = usuario?.role ?? 'residente';
  let pdfInput: Parameters<typeof generarTicketPDF>[0];
  if (ticket.pago?.perfil) {
    if (ticket.pago.estado !== 'pagado') {
      return Response.json({ error: 'El pago aún no está confirmado' }, { status: 409 });
    }
    const esDuenio = ticket.pago.perfil.userId === session.user.id;
    const esAdmin = role === 'admin';
    const esRepresentante = role === 'representante' && ticket.pago.fraccionamiento?.representanteId === session.user.id;
    if (!esDuenio && !esAdmin && !esRepresentante) return Response.json({ error: 'No autorizado' }, { status: 403 });
    pdfInput = {
      folio: ticket.folio,
      fraccionamiento: ticket.pago.fraccionamiento?.nombre ?? 'SISCO',
      nombre: ticket.pago.perfil.usuario?.name ?? 'Residente',
      edificio: ticket.pago.perfil.edificio,
      departamento: ticket.pago.perfil.departamento,
      mes: ticket.pago.mes,
      anio: ticket.pago.anio,
      monto: ticket.pago.monto,
      montoBase: ticket.pago.montoBase,
      iva: ticket.pago.iva,
      comisionMercadoPago: ticket.pago.comisionMercadoPago,
      retencionIsr: ticket.pago.retencionIsr,
      retencionIva: ticket.pago.retencionIva,
      emailContacto: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'contactoservicio4soles@gmail.com',
      tipoComprobante: 'agua',
      esReconexion: ticket.pago.esReconexion ?? false,
    };
  } else if (ticket.cargoServicio) {
    if (ticket.cargoServicio.estado !== 'pagado') return Response.json({ error: 'El cargo aún no está pagado' }, { status: 409 });
    const [cargo] = await db.select({
      perfilId: cargosServicios.perfilId,
      fraccionamientoId: cargosServicios.fraccionamientoId,
      mes: cargosServicios.mes,
      anio: cargosServicios.anio,
      monto: cargosServicios.monto,
      servicioNombre: servicios.nombre,
      fraccionamientoNombre: fraccionamientos.nombre,
      fraccionamientoRepresentanteId: fraccionamientos.representanteId,
      userId: perfilesResidente.userId,
      nombre: user.name,
      edificio: perfilesResidente.edificio,
      departamento: perfilesResidente.departamento,
    }).from(cargosServicios)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, cargosServicios.perfilId))
      .innerJoin(user, eq(user.id, perfilesResidente.userId))
      .innerJoin(fraccionamientos, eq(fraccionamientos.id, cargosServicios.fraccionamientoId))
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(eq(cargosServicios.id, ticket.cargoServicio.id), eq(cargosServicios.fraccionamientoId, perfilesResidente.fraccionamientoId)))
      .limit(1);
    if (!cargo) return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
    const esDuenio = cargo.userId === session.user.id;
    const esAdmin = role === 'admin';
    const esRepresentante = role === 'representante' && cargo.fraccionamientoRepresentanteId === session.user.id;
    if (!esDuenio && !esAdmin && !esRepresentante) return Response.json({ error: 'No autorizado' }, { status: 403 });
    pdfInput = {
      folio: ticket.folio,
      fraccionamiento: cargo.fraccionamientoNombre ?? 'SISCO',
      nombre: cargo.nombre ?? 'Residente',
      edificio: cargo.edificio,
      departamento: cargo.departamento,
      mes: cargo.mes,
      anio: cargo.anio,
      monto: cargo.monto,
      montoBase: cargo.monto,
      iva: '0.00',
      comisionMercadoPago: '0.00',
      retencionIsr: '0.00',
      retencionIva: '0.00',
      emailContacto: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'contactoservicio4soles@gmail.com',
      tipoComprobante: 'servicio',
      servicioNombre: cargo.servicioNombre,
    };
  } else {
    return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
  }

  // Siempre regeneramos el recibo con la plantilla vigente. Esto evita servir
  // PDFs cacheados de versiones anteriores que pudieran incluir QR u otros
  // elementos retirados del formato oficial.
  logger.info('ticket.pdf.generando', { folio });
  const pdf = await generarTicketPDF(pdfInput);

  // Las versiones anteriores guardaban recibos públicos. Sólo borramos la ruta
  // histórica exacta de este folio; referencias desconocidas no se siguen.
  if (ticket.pdfUrl && !storage.isCurrentReference(folio, ticket.pdfUrl)) {
    try {
      const removed = await storage.removeLegacyPublicCopy(folio, ticket.pdfUrl);
      if (!removed) logger.warn('ticket.pdf.legacy_reference_ignored', { folio });
    } catch (deleteError) {
      logger.error('ticket.pdf.legacy_delete_error', deleteError, { folio });
    }
  }

  try {
    const privateReference = await storage.upload(folio, pdf);
    await db
      .update(tickets)
      .set({ pdfUrl: privateReference })
      .where(eq(tickets.folio, folio));
    logger.info('ticket.pdf.cacheado', { folio });
  } catch (uploadError) {
    // Blob es una optimización: un fallo no debe impedir descargar el recibo generado.
    logger.error('ticket.pdf.upload_error', uploadError, { folio });
  }

  return pdfResponse(pdf, folio);
  } finally {
    await ticketGuard.release();
  }
}
