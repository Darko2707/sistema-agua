import { createMercadoPagoClients } from '@/lib/mercadopago';
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
  const accessToken = perfil?.circuito?.mercadoPagoAccessToken;
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
    const paymentReference = parseExternalReference(payment.external_reference) ?? reference;

    if (payment.status !== 'approved' || !paymentReference) {
      fallbackUrl.searchParams.set('payment', payment.status === 'pending' ? 'pending' : 'failure');
      return Response.redirect(fallbackUrl);
    }

    logger.info('mp.return.pago_aprobado', {
      paymentId:    String(payment.id),
      perfilId:     paymentReference.perfilId,
      mes:          paymentReference.mes,
      anio:         paymentReference.anio,
      monto:        paymentReference.monto,
      esReconexion: paymentReference.esReconexion,
    });
    await procesarPagoMpHandler.execute({
      ...paymentReference,
      metodo:                `mercado_pago:${payment.id}`,
      mercadoPagoPaymentId:  payment.id ? String(payment.id) : undefined,
      mercadoPagoCollectorId: payment.collector_id ? String(payment.collector_id) : undefined,
    });

    fallbackUrl.searchParams.set('payment', 'success');
    return Response.redirect(fallbackUrl);
  } catch (error) {
    logger.error('mp.return.error', error, { paymentId: paymentId ?? 'unknown' });
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }
}
