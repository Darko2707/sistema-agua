import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

import { createMercadoPagoClients } from '@/lib/mercadopago';
import { db } from '@/db';
import { registrarPagoAprobado } from '@/server/pagos-service';

function parseExternalReference(value: string | undefined) {
  const [prefix, perfilId, mes, anio, esReconexion, monto] = (value ?? '').split('|');

  if (prefix !== 'agua' || !perfilId || !mes || !anio || !monto) {
    return null;
  }

  return {
    perfilId,
    mes: Number(mes),
    anio: Number(anio),
    esReconexion: esReconexion === '1',
    monto: Number(monto).toFixed(2),
  };
}

async function getPaymentClientForReference(reference: ReturnType<typeof parseExternalReference>) {
  if (!reference) return null;

  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, reference.perfilId),
    with: { circuito: true },
  });

  const accessToken = perfil?.circuito?.mercadoPagoAccessToken;
  return accessToken ? createMercadoPagoClients(accessToken).paymentClient : null;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (webhookSecret) {
      WebhookSignatureValidator.validate({
        xSignature: request.headers.get('x-signature'),
        xRequestId: request.headers.get('x-request-id'),
        dataId: url.searchParams.get('data.id'),
        secret: webhookSecret,
        toleranceSeconds: 300,
      });
    }

    const payload = await request.json().catch(() => ({}));
    const paymentId =
      payload?.data?.id ??
      payload?.id ??
      url.searchParams.get('data.id') ??
      url.searchParams.get('id');

    if (!paymentId) {
      return Response.json({ received: true });
    }

    const referenceFromUrl = parseExternalReference(url.searchParams.get('ref') ?? undefined);
    const paymentClient = await getPaymentClientForReference(referenceFromUrl);
    if (!paymentClient) {
      return Response.json({ received: true });
    }

    const payment = await paymentClient.get({ id: paymentId });
    const reference = parseExternalReference(payment.external_reference) ?? referenceFromUrl;

    if (payment.status === 'approved' && reference) {
      await registrarPagoAprobado({
        ...reference,
        metodo: `mercado_pago:${payment.id}`,
        mercadoPagoPaymentId: payment.id ? String(payment.id) : undefined,
        mercadoPagoCollectorId: payment.collector_id ? String(payment.collector_id) : undefined,
      });
    }

    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      console.error('Firma invalida de webhook de Mercado Pago:', error.reason);
      return Response.json({ error: 'Firma invalida' }, { status: 401 });
    }

    console.error('Error procesando webhook de Mercado Pago:', error);
    return Response.json({ received: true });
  }
}
