import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { db } from '@/db';
import { parseExternalReference, type ExternalReference } from '@/src/infrastructure/mercadopago/parser';
import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { logger } from '@/lib/logger';

const procesarPagoMpHandler = new ProcesarPagoMpHandler({ residenteRepo, pagoRepo, circuitoRepo });

async function getPaymentClientForReference(reference: ExternalReference | null) {
  if (!reference) return null;
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, reference.perfilId),
    with: { circuito: true },
  });
  // Descifrar el token antes de usarlo
  const accessToken = decryptTokenSafe(perfil?.circuito?.mercadoPagoAccessToken);
  return accessToken ? createMercadoPagoClients(accessToken).paymentClient : null;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    // La firma es OBLIGATORIA. Sin MP_WEBHOOK_SECRET cualquiera podría
    // enviar webhooks falsos y acreditar pagos que no existen.
    if (!webhookSecret) {
      logger.error('mp.webhook.misconfigured', undefined, {
        message: 'MP_WEBHOOK_SECRET no está configurado — endpoint deshabilitado',
      });
      return new Response('Service Unavailable', { status: 503 });
    }

    WebhookSignatureValidator.validate({
      xSignature:       request.headers.get('x-signature'),
      xRequestId:       request.headers.get('x-request-id'),
      dataId:           url.searchParams.get('data.id'),
      secret:           webhookSecret,
      toleranceSeconds: 300,
    });

    const payload = await request.json().catch(() => ({}));
    const paymentId =
      payload?.data?.id ??
      payload?.id ??
      url.searchParams.get('data.id') ??
      url.searchParams.get('id');

    if (!paymentId) return Response.json({ received: true });

    const referenceFromUrl = parseExternalReference(url.searchParams.get('ref') ?? undefined);
    const paymentClient = await getPaymentClientForReference(referenceFromUrl);
    if (!paymentClient) return Response.json({ received: true });

    const payment = await paymentClient.get({ id: paymentId });
    const reference = parseExternalReference(payment.external_reference) ?? referenceFromUrl;

    if (payment.status === 'approved' && reference) {
      logger.info('mp.webhook.pago_aprobado', {
        paymentId: String(payment.id),
        perfilId:  reference.perfilId,
        mes:       reference.mes,
        anio:      reference.anio,
        monto:     reference.monto,
        esReconexion: reference.esReconexion,
      });
      await procesarPagoMpHandler.execute({
        ...reference,
        metodo:                `mercado_pago:${payment.id}`,
        mercadoPagoPaymentId:  payment.id ? String(payment.id) : undefined,
        mercadoPagoCollectorId: payment.collector_id ? String(payment.collector_id) : undefined,
      });
    }

    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      logger.warn('mp.webhook.firma_invalida', { reason: error.reason });
      return Response.json({ error: 'Firma invalida' }, { status: 401 });
    }
    logger.error('mp.webhook.error', error);
    return Response.json({ received: true });
  }
}
