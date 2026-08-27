import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { MercadoPagoPaymentIntentConflictError } from '@/src/application/pagos/errors/mercado-pago-payment-intent-conflict.error';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import {
  fetchVerifiedMercadoPagoPayment,
  MercadoPagoPaymentValidationError,
} from '@/src/infrastructure/mercadopago/payment-verification';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const procesarPagoMpHandler = new ProcesarPagoMpHandler({ residenteRepo, pagoRepo, circuitoRepo });

const paymentIdSchema = z.union([
  z.string(),
  z.number().int().nonnegative(),
]).transform(String).pipe(z.string().regex(/^\d{1,32}$/));

const webhookPayloadSchema = z.object({
  data: z.object({ id: paymentIdSchema.optional() }).passthrough().optional(),
  id: paymentIdSchema.optional(),
}).passthrough();

export function OPTIONS() {
  // webhook is server-to-server only (MercadoPago → our server); browser access not supported
  return new Response(null, { status: 405 });
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    // La firma es OBLIGATORIA. Sin MP_WEBHOOK_SECRET cualquiera podría
    // enviar webhooks falsos y acreditar pagos que no existen.
    if (!webhookSecret) {
      Sentry.captureMessage('MP_WEBHOOK_SECRET no configurado — webhook deshabilitado', {
        tags: { component: 'webhook', error_type: 'misconfigured' },
        level: 'fatal',
      });
      logger.error('mp.webhook.misconfigured', undefined, {
        message: 'MP_WEBHOOK_SECRET no está configurado — endpoint deshabilitado',
      });
      return new Response('Service Unavailable', { status: 503 });
    }

    const paymentIdResult = paymentIdSchema.safeParse(url.searchParams.get('data.id'));
    if (!paymentIdResult.success) {
      return Response.json({ error: 'Falta data.id valido' }, { status: 400 });
    }
    const paymentId = paymentIdResult.data;

    WebhookSignatureValidator.validate({
      xSignature:       request.headers.get('x-signature'),
      xRequestId:       request.headers.get('x-request-id'),
      dataId:           paymentId,
      secret:           webhookSecret,
      toleranceSeconds: 300,
    });

    const rawPayload: unknown = await request.json().catch(() => null);
    if (rawPayload !== null) {
      const payload = webhookPayloadSchema.safeParse(rawPayload);
      if (!payload.success) {
        return Response.json({ error: 'Payload invalido' }, { status: 400 });
      }
      const bodyIds = [payload.data.data?.id, payload.data.id]
        .filter((id): id is string => id !== undefined);
      if (bodyIds.some(id => id !== paymentId)) {
        return Response.json({ error: 'Payment ID inconsistente' }, { status: 400 });
      }
    }

    const verified = await fetchVerifiedMercadoPagoPayment({
      externalReference: url.searchParams.get('ref'),
      paymentId,
    });

    if (verified.status === 'approved') {
      logger.info('mp.webhook.pago_aprobado', {
        paymentId: verified.paymentId,
        perfilId: verified.perfilId,
        monto: verified.expectedTotal,
        esReconexion: verified.periodos.some(periodo => periodo.esReconexion),
        mesesAdelantados: verified.periodos.length,
      });
      const result = await procesarPagoMpHandler.execute({
        perfilId: verified.perfilId,
        circuitoId: verified.circuitoId,
        paymentIntentReference: verified.paymentIntentReference,
        periodos: verified.periodos,
        metodo: 'mercado_pago',
        mercadoPagoPaymentId: verified.paymentId,
        mercadoPagoCollectorId: verified.collectorId,
      });
      if (!result.yaRegistrado) schedulePushDispatch();
    }

    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      logger.warn('mp.webhook.firma_invalida', { reason: error.reason });
      return Response.json({ error: 'Firma invalida' }, { status: 401 });
    }
    if (error instanceof MercadoPagoPaymentValidationError) {
      Sentry.captureException(error, {
        tags: { component: 'webhook', error_type: 'payment_validation_failed' },
        level: 'warning',
        extra: { reason: error.reason },
      });
      logger.warn('mp.webhook.pago_invalido', { reason: error.reason });
      return Response.json({ received: true, credited: false });
    }
    if (error instanceof MercadoPagoPeriodConflictError) {
      Sentry.captureException(error, {
        tags: { component: 'webhook', error_type: 'payment_period_conflict' },
        level: 'error',
        extra: {
          requestedPaymentId: error.requestedPaymentId,
          conflicts: error.conflicts,
        },
      });
      logger.error('mp.webhook.conflicto_periodos', error, {
        paymentId: error.requestedPaymentId,
        periodos: error.conflicts.map(conflict => `${conflict.anio}-${conflict.mes}`),
      });
      // Se reconoce el webhook para evitar reintentos infinitos, pero ningun
      // periodo se acredita: la transaccion completa ya fue revertida.
      return Response.json({ received: true, credited: false, conflict: true });
    }
    if (error instanceof MercadoPagoPaymentIntentConflictError) {
      Sentry.captureException(error, {
        tags: { component: 'webhook', error_type: 'payment_intent_conflict' },
        level: 'error',
        extra: {
          reason: error.reason,
          paymentIntentReference: error.paymentIntentReference,
          requestedPaymentId: error.requestedPaymentId,
        },
      });
      logger.error('mp.webhook.conflicto_intencion', error, {
        reason: error.reason,
        paymentIntentReference: error.paymentIntentReference,
        paymentId: error.requestedPaymentId,
      });
      return Response.json({ received: true, credited: false, conflict: true });
    }
    Sentry.captureException(error, {
      tags: { component: 'webhook', error_type: 'processing_error' },
    });
    logger.error('mp.webhook.error', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
