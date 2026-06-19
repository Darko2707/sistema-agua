import { headers } from 'next/headers';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { generarTicketPDF } from '@/lib/ticket';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ folio: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { folio } = await ctx.params;
  const ticket = await db.query.tickets.findFirst({
    where: (t, { eq }) => eq(t.folio, folio),
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
  });

  if (!ticket?.pago?.perfil) {
    return Response.json({ error: 'Folio no encontrado' }, { status: 404 });
  }

  const usuario = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  const role = usuario?.role ?? 'residente';
  const esDuenio = ticket.pago.perfil.userId === session.user.id;
  const esAdmin = role === 'admin';
  const esRepresentante =
    role === 'representante' && ticket.pago.circuito?.representanteId === session.user.id;

  if (!esDuenio && !esAdmin && !esRepresentante) {
    return Response.json({ error: 'No autorizado' }, { status: 403 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    new URL(request.url).origin;

  const pdf = await generarTicketPDF({
    folio: ticket.folio,
    fraccionamiento: process.env.NEXT_PUBLIC_FRACCIONAMIENTO_NOMBRE ?? 'Sistema de Agua',
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
    emailContacto: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'contacto@sistema-agua.local',
    verificarUrl: `${baseUrl}/verificar/${ticket.folio}`,
  });

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="folio-${ticket.folio}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
