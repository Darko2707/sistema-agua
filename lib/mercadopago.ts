import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

export const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

export const preferenceClient = new Preference(mp)
export const paymentClient    = new Payment(mp)

export function createMercadoPagoClients(accessToken: string) {
  const client = new MercadoPagoConfig({ accessToken })

  return {
    preferenceClient: new Preference(client),
    paymentClient: new Payment(client),
  }
}
