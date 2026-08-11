import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

export function createMercadoPagoClients(accessToken: string) {
  const client = new MercadoPagoConfig({ accessToken })

  return {
    preferenceClient: new Preference(client),
    paymentClient: new Payment(client),
  }
}
