import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { cargosServicios, circuitos, fraccionamientoServicios, perfilesResidente, servicios, tickets, user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { guardTicketPdf } from '@/lib/ticket-pdf-guard';
import { generarTicketPDF } from '@/server/services/pdf';
import { VercelBlobAdapter } from '@/src/infrastructure/storage/vercel-blob.adapter';

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

  const ticket = await db.query.tickets.findFirst({
    where: (ticketTable, { eq: equals }) => equals(ticketTable.folio, folio),
    with: {
      pago: {
        with: {
          circuito: true,
          perfil: {
            with: { usuario: true },
          },
        },
      },
      cargoServicio: true,
    },
  });

  if (!ticket) {
    return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
  }

  const usuario = await db.query.user.findFirst({
    where: (userTable, { eq: equals }) => equals(userTable.id, session.user.id),
  });
  const role = usuario?.role ?? 'residente';
  let pdfInput: Parameters<typeof generarTicketPDF>[0];
  if (ticket.pago?.perfil) {
    const esDuenio = ticket.pago.perfil.userId === session.user.id;
    const esAdmin = role === 'admin';
    const esRepresentante = role === 'representante' && ticket.pago.circuito?.representanteId === session.user.id;
    if (!esDuenio && !esAdmin && !esRepresentante) return Response.json({ error: 'No autorizado' }, { status: 403 });
    pdfInput = {
      folio: ticket.folio,
      fraccionamiento: process.env.NEXT_PUBLIC_FRACCIONAMIENTO_NOMBRE ?? 'SISCO',
      circuito: ticket.pago.circuito?.nombre,
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
      circuitoNombre: circuitos.nombre,
      circuitoRepresentanteId: circuitos.representanteId,
      userId: perfilesResidente.userId,
      nombre: user.name,
      edificio: perfilesResidente.edificio,
      departamento: perfilesResidente.departamento,
    }).from(cargosServicios)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, cargosServicios.perfilId))
      .innerJoin(user, eq(user.id, perfilesResidente.userId))
      .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(eq(cargosServicios.id, ticket.cargoServicio.id), eq(cargosServicios.fraccionamientoId, perfilesResidente.fraccionamientoId)))
      .limit(1);
    if (!cargo) return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
    const esDuenio = cargo.userId === session.user.id;
    const esAdmin = role === 'admin';
    const esRepresentante = role === 'representante' && cargo.circuitoRepresentanteId === session.user.id;
    if (!esDuenio && !esAdmin && !esRepresentante) return Response.json({ error: 'No autorizado' }, { status: 403 });
    pdfInput = {
      folio: ticket.folio,
      fraccionamiento: process.env.NEXT_PUBLIC_FRACCIONAMIENTO_NOMBRE ?? 'SISCO',
      circuito: cargo.circuitoNombre,
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
