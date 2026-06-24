import { headers } from 'next/headers';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { generarTicketPDF } from '@/server/services/pdf';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// PDFs son inmutables: el folio nunca cambia de contenido.
// private → el browser lo cachea, el CDN no (la auth se verifica en esta ruta).
const CACHE_CONTROL = 'private, max-age=31536000, immutable';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ folio: string }> },
) {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { folio } = await ctx.params;

  // ── Buscar ticket en DB ───────────────────────────────────────────────────
  const ticket = await db.query.tickets.findFirst({
    where: (t, { eq }) => eq(t.folio, folio),
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

  // ── Autorización: dueño, admin o representante del circuito ───────────────
  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  const role = usuario?.role ?? 'residente';
  const esDuenio       = ticket.pago.perfil.userId === session.user.id;
  const esAdmin        = role === 'admin';
  const esRepresentante =
    role === 'representante' &&
    ticket.pago.circuito?.representanteId === session.user.id;

  if (!esDuenio && !esAdmin && !esRepresentante) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  // ── Generar PDF ───────────────────────────────────────────────────────────
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

  return new Response(pdf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${folio}.pdf"`,
      'Cache-Control':       CACHE_CONTROL,
    },
  });
}
