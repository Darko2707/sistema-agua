import { createMercadoPagoClients } from '@/lib/mercadopago';
import * as Sentry from '@sentry/nextjs';
import { decryptTokenSafe } from '@/lib/crypto';
import { db } from '@/db';
import { expandExternalReference, parseExternalReference, type ExternalReference } from '@/src/infrastructure/mercadopago/parser';
import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const procesarPagoMpHandler = new ProcesarPagoMpHandler({ residenteRepo, pagoRepo, circuitoRepo });

async function getPaymentClientForReference(reference: ExternalReference | null) {
  if (!reference) return null;
  const perfil = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, reference.perfilId),
    with: { circuito: true },
  });
  const accessToken = decryptTokenSafe(perfil?.circuito?.mercadoPagoAccessToken);
  return accessToken ? createMercadoPagoClients(accessToken).paymentClient : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get('payment_id') ?? url.searchParams.get('collection_id');
  const reference = parseExternalReference(url.searchParams.get('ref') ?? undefined);
  const fallbackUrl = new URL('/residente', url.origin);

  if (!paymentId) {
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }

  try {
    const paymentClient = await getPaymentClientForReference(reference);
    if (!paymentClient) {
      fallbackUrl.searchParams.set('payment', 'failure');
      return Response.redirect(fallbackUrl);
    }

    const payment = await paymentClient.get({ id: paymentId });
    const paymentReference = parseExternalReference(payment.external_reference);

    if (payment.status !== 'approved' || !paymentReference) {
      fallbackUrl.searchParams.set('payment', payment.status === 'pending' ? 'pending' : 'failure');
      return Response.redirect(fallbackUrl);
    }

    const references = expandExternalReference(paymentReference);
    logger.info('mp.return.pago_aprobado', {
      paymentId:    String(payment.id),
      perfilId:     paymentReference.perfilId,
      mes:          paymentReference.mes,
      anio:         paymentReference.anio,
      monto:        paymentReference.monto,
      esReconexion: paymentReference.esReconexion,
      mesesAdelantados: references.length,
    });
    const result = await procesarPagoMpHandler.execute({
      perfilId: paymentReference.perfilId,
      periodos: references.map(({ mes, anio, monto, esReconexion }) => ({
        mes,
        anio,
        monto,
        esReconexion,
      })),
      metodo: 'mercado_pago',
      mercadoPagoPaymentId: String(payment.id ?? paymentId),
      mercadoPagoCollectorId: payment.collector_id ? String(payment.collector_id) : undefined,
    });
    if (!result.yaRegistrado) schedulePushDispatch();

    fallbackUrl.searchParams.set('payment', 'success');
    return Response.redirect(fallbackUrl);
  } catch (error) {
    if (error instanceof MercadoPagoPeriodConflictError) {
      Sentry.captureException(error, {
        tags: { component: 'mercadopago-return', error_type: 'payment_period_conflict' },
        level: 'error',
        extra: {
          requestedPaymentId: error.requestedPaymentId,
          conflicts: error.conflicts,
        },
      });
      logger.error('mp.return.conflicto_periodos', error, {
        paymentId: error.requestedPaymentId,
        periodos: error.conflicts.map(conflict => `${conflict.anio}-${conflict.mes}`),
      });
      fallbackUrl.searchParams.set('payment', 'failure');
      return Response.redirect(fallbackUrl);
    }
    logger.error('mp.return.error', error, { paymentId: paymentId ?? 'unknown' });
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }
}
