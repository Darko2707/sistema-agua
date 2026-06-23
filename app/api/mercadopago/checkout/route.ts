import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { calcularDesglosePago, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { db } from '@/db';

const checkoutSchema = z.object({ esReconexion: z.boolean().optional() });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!appUrl) return Response.json({ error: 'Falta configurar NEXT_PUBLIC_APP_URL' }, { status: 500 });

  const body = checkoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: 'Solicitud invalida' }, { status: 400 });

  const perfil = await residenteRepo.findByUserId(session.user.id);
  if (!perfil) return Response.json({ error: 'Completa tu perfil primero' }, { status: 400 });
  if (!perfil.circuito?.representanteId) return Response.json({ error: 'Tu circuito no tiene representante asignado' }, { status: 400 });
  if (!perfil.circuito.mercadoPagoAccessToken) {
    return Response.json({ error: 'El representante de tu circuito aun no tiene Mercado Pago configurado' }, { status: 400 });
  }

  const periodo = PeriodoVO.vigente();
  const pagoExistente = await db.query.pagos.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.perfilId, perfil.id), eq(p.mes, periodo.mes), eq(p.anio, periodo.anio), eq(p.estado, 'pagado')),
  });
  if (pagoExistente) return Response.json({ error: 'Ya pagaste este mes' }, { status: 400 });

  const esReconexion = perfil.estadoAgua === 'cortado';
  const montoBase = calcularMontoBase(perfil.circuito.montoMensual, esReconexion, perfil.circuito.montoReconexion);
  const desglose = calcularDesglosePago(montoBase);

  const externalReference = ['agua', perfil.id, periodo.mes, periodo.anio, esReconexion ? '1' : '0', desglose.montoBase].join('|');
  const baseUrl = appUrl.replace(/\/$/, '');
  const referenceParam = encodeURIComponent(externalReference);
  const { preferenceClient } = createMercadoPagoClients(perfil.circuito.mercadoPagoAccessToken);

  const preference = await preferenceClient.create({
    body: {
      items: [{
        id:          externalReference,
        title:       esReconexion ? 'Pago de agua y reconexion' : 'Pago mensual de agua',
        description: `Periodo ${periodo.mes}/${periodo.anio}`,
        quantity:    1,
        currency_id: 'MXN',
        unit_price:  Number(desglose.total),
      }],
      payer:              { email: session.user.email, name: session.user.name },
      external_reference: externalReference,
      notification_url:   `${baseUrl}/api/mercadopago/webhook?ref=${referenceParam}`,
      back_urls: {
        success: `${baseUrl}/api/mercadopago/return?ref=${referenceParam}`,
        pending: `${baseUrl}/residente?payment=pending`,
        failure: `${baseUrl}/residente?payment=failure`,
      },
      auto_return:  'approved',
      binary_mode:  true,
    },
  });

  const url = preference.init_point ?? preference.sandbox_init_point;
  if (!url) return Response.json({ error: 'Mercado Pago no devolvio una URL de pago' }, { status: 502 });

  return Response.json({ url, desglose });
}
