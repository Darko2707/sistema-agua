import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { tickets } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
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
    },
  });

  if (!ticket?.pago?.perfil) {
    return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
  }

  const usuario = await db.query.user.findFirst({
    where: (userTable, { eq: equals }) => equals(userTable.id, session.user.id),
  });
  const role = usuario?.role ?? 'residente';
  const esDuenio = ticket.pago.perfil.userId === session.user.id;
  const esAdmin = role === 'admin';
  const esRepresentante =
    role === 'representante' &&
    ticket.pago.circuito?.representanteId === session.user.id;

  if (!esDuenio && !esAdmin && !esRepresentante) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Siempre regeneramos el recibo con la plantilla vigente. Esto evita servir
  // PDFs cacheados de versiones anteriores que pudieran incluir QR u otros
  // elementos retirados del formato oficial.
  logger.info('ticket.pdf.generando', { folio });
  const pdf = await generarTicketPDF({
    folio:               ticket.folio,
    fraccionamiento:     process.env.NEXT_PUBLIC_FRACCIONAMIENTO_NOMBRE ?? 'SIS4S',
    circuito:            ticket.pago.circuito?.nombre,
    nombre:              ticket.pago.perfil.usuario?.name ?? 'Residente',
    edificio:            ticket.pago.perfil.edificio,
    departamento:        ticket.pago.perfil.departamento,
    mes:                 ticket.pago.mes,
    anio:                ticket.pago.anio,
    monto:               ticket.pago.monto,
    montoBase:           ticket.pago.montoBase,
    iva:                 ticket.pago.iva,
    comisionMercadoPago: ticket.pago.comisionMercadoPago,
    retencionIsr:        ticket.pago.retencionIsr,
    retencionIva:        ticket.pago.retencionIva,
    emailContacto:       process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'contactoservicio4soles@gmail.com',
  });

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
}
