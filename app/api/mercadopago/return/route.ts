import {
  fetchVerifiedMercadoPagoPayment,
  MercadoPagoPaymentValidationError,
} from '@/src/infrastructure/mercadopago/payment-verification';
import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { logger } from '@/lib/logger';
import { schedulePushDispatch } from '@/lib/push-dispatcher';

const procesarPagoMpHandler = new ProcesarPagoMpHandler({ residenteRepo, pagoRepo, circuitoRepo });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get('payment_id') ?? url.searchParams.get('collection_id');
  const externalReference = url.searchParams.get('ref');
  const fallbackUrl = new URL('/residente', url.origin);

  if (!paymentId || !externalReference) {
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }

  try {
    const verified = await fetchVerifiedMercadoPagoPayment({
      externalReference,
      paymentId,
    });

    logger.info('mp.return.pago_verificado', {
      paymentId: verified.paymentId,
      perfilId: verified.perfilId,
      status: verified.status,
    });
    if (verified.status === 'approved') {
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
    fallbackUrl.searchParams.set(
      'payment',
      verified.status === 'approved'
        ? 'success'
        : verified.status === 'pending'
          ? 'pending'
          : 'failure',
    );
    return Response.redirect(fallbackUrl);
  } catch (error) {
    if (error instanceof MercadoPagoPaymentValidationError) {
      logger.warn('mp.return.pago_invalido', { paymentId, reason: error.reason });
    } else {
      logger.error('mp.return.error', error, { paymentId });
    }
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }
}
