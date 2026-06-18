import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { preferenceClient } from '@/lib/mercadopago';
import { db } from '@/db';
import { obtenerPeriodoVigente } from '@/server/utils';

const MONTO_MENSUAL = 50;
const MONTO_RECONEXION = 300;

const checkoutSchema = z.object({
  esReconexion: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return Response.json({ error: 'Falta configurar MP_ACCESS_TOKEN' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!appUrl) {
    return Response.json({ error: 'Falta configurar NEXT_PUBLIC_APP_URL' }, { status: 500 });
  }

  const body = checkoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return Response.json({ error: 'Solicitud invalida' }, { status: 400 });
  }

  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.userId, session.user.id),
  });

  if (!perfil) {
    return Response.json({ error: 'Completa tu perfil primero' }, { status: 400 });
  }

  const { mes, anio } = obtenerPeriodoVigente();
  const pagoExistente = await db.query.pagos.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.perfilId, perfil.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
  });

  if (pagoExistente) {
    return Response.json({ error: 'Ya pagaste este mes' }, { status: 400 });
  }

  const esReconexion = perfil.estadoAgua === 'cortado';
  const monto = esReconexion ? MONTO_MENSUAL + MONTO_RECONEXION : MONTO_MENSUAL;
  const externalReference = ['agua', perfil.id, mes, anio, esReconexion ? '1' : '0', monto].join('|');
  const baseUrl = appUrl.replace(/\/$/, '');

  const preference = await preferenceClient.create({
    body: {
      items: [
        {
          id: externalReference,
          title: esReconexion ? 'Pago de agua y reconexion' : 'Pago mensual de agua',
          description: `Periodo ${mes}/${anio}`,
          quantity: 1,
          currency_id: 'MXN',
          unit_price: monto,
        },
      ],
      payer: {
        email: session.user.email,
        name: session.user.name,
      },
      external_reference: externalReference,
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      back_urls: {
        success: `${baseUrl}/api/mercadopago/return`,
        pending: `${baseUrl}/residente?payment=pending`,
        failure: `${baseUrl}/residente?payment=failure`,
      },
      auto_return: 'approved',
      binary_mode: true,
    },
  });

  const url = preference.init_point ?? preference.sandbox_init_point;

  if (!url) {
    return Response.json({ error: 'Mercado Pago no devolvio una URL de pago' }, { status: 502 });
  }

  return Response.json({ url });
}
