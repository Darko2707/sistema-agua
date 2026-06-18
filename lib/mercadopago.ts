import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

export const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

export const preferenceClient = new Preference(mp)
export const paymentClient    = new Payment(mp)