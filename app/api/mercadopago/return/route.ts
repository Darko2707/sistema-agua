import { paymentClient } from '@/lib/mercadopago';
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get('payment_id') ?? url.searchParams.get('collection_id');
  const fallbackUrl = new URL('/residente', url.origin);

  if (!paymentId) {
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }

  try {
    const payment = await paymentClient.get({ id: paymentId });
    const reference = parseExternalReference(payment.external_reference);

    if (payment.status !== 'approved' || !reference) {
      fallbackUrl.searchParams.set('payment', payment.status === 'pending' ? 'pending' : 'failure');
      return Response.redirect(fallbackUrl);
    }

    await registrarPagoAprobado({
      ...reference,
      metodo: `mercado_pago:${payment.id}`,
    });

    fallbackUrl.searchParams.set('payment', 'success');
    return Response.redirect(fallbackUrl);
  } catch (error) {
    console.error('Error confirmando pago de Mercado Pago:', error);
    fallbackUrl.searchParams.set('payment', 'failure');
    return Response.redirect(fallbackUrl);
  }
}
