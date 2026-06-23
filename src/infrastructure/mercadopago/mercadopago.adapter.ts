import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import type { PaymentGateway, CrearPreferenciaInput } from '@/src/application/ports/payment-gateway';

export class MercadoPagoAdapter implements PaymentGateway {
  private preferenceClient: Preference;
  private paymentClient: Payment;

  constructor(accessToken: string) {
    const client = new MercadoPagoConfig({ accessToken });
    this.preferenceClient = new Preference(client);
    this.paymentClient = new Payment(client);
  }

  async crearPreferencia(input: CrearPreferenciaInput) {
    const pref = await this.preferenceClient.create({
      body: {
        items: [{
          id:          input.externalReference,
          title:       input.titulo,
          description: input.descripcion,
          quantity:    1,
          currency_id: 'MXN',
          unit_price:  input.monto,
        }],
        payer: { email: input.payerEmail, name: input.payerName },
        external_reference: input.externalReference,
        notification_url:   input.notificationUrl,
        back_urls: {
          success: input.backUrls.success,
          pending: input.backUrls.pending,
          failure: input.backUrls.failure,
        },
        auto_return: 'approved',
        binary_mode: true,
      },
    });
    const url = pref.init_point ?? pref.sandbox_init_point;
    if (!url) throw new Error('Mercado Pago no devolvió una URL de pago');
    return { url, preferenceId: pref.id ?? '' };
  }

  async obtenerPago(paymentId: string, _accessToken: string) {
    const payment = await this.paymentClient.get({ id: paymentId });
    return {
      id:                String(payment.id),
      status:            payment.status ?? '',
      externalReference: payment.external_reference ?? null,
      collectorId:       payment.collector_id ?? null,
    };
  }
}
