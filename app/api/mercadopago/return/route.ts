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

    await registrarPagoAprobado({
      ...paymentReference,
      metodo: `mercado_pago:${payment.id}`,
      mercadoPagoPaymentId: payment.id ? String(payment.id) : undefined,
      mercadoPagoCollectorId: payment.collector_id ? String(payment.collector_id) : undefined,
    });

    fallbackUrl.searchParams.set('payment', 'success');
    return Response.redirect(fallbackUrl);
  } catch (error) {
    console.error('Error confirmando pago de Mercado Pago:', error);
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }
}
