import {
  fetchVerifiedMercadoPagoPayment,
  MercadoPagoPaymentValidationError,
} from '@/src/infrastructure/mercadopago/payment-verification';
import { logger } from '@/lib/logger';

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
