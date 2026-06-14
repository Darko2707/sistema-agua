import { Worker } from 'bullmq'
import { db } from '@/db'
import { tickets } from '@/db/schema'
import { generarTicketPDF } from '@/lib/ticket'
import { Resend } from 'resend'

// Error 1 — no importar ioredis aquí, pasar solo la URL como string
const connection = {
  url: process.env.REDIS_URL!,
  maxRetriesPerRequest: null as null,
}

const resend = new Resend(process.env.RESEND_API_KEY)

new Worker('tickets', async (job) => {
  const { pagoId, folio, email } = job.data

  const pago = await db.query.pagos.findFirst({
    where: (p, { eq }) => eq(p.id, pagoId),
    with: { departamento: { with: { residente: true } } }
  })
  if (!pago) throw new Error('Pago no encontrado')

  // Error 3 — folio estaba duplicado por el spread, lo pasamos explícito
  const pdf = await generarTicketPDF({
    folio,
    nombre: pago.departamento?.residente?.nombre ?? 'Residente',
    mes:     pago.mes,
    anio:    pago.anio,
    monto:   pago.monto,
  })

  const pdfUrl = `${process.env.R2_PUBLIC_URL}/tickets/${folio}.pdf`

  await db.insert(tickets).values({ pagoId, folio, pdfUrl })

  // Error 2 — Resend requiere html o text, no solo attachments
  await resend.emails.send({
    from: 'contactoservicio4soles@gmail.com',
    to: email,
    subject: `Comprobante de pago ${folio}`,
    html: `<p>Tu pago ha sido registrado correctamente.</p>
           <p><strong>Folio:</strong> ${folio}</p>
           <p>Adjunto encontrarás tu comprobante en PDF.</p>`,
    attachments: [{ filename: `${folio}.pdf`, content: pdf }],
  })
}, { connection })