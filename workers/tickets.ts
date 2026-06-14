import { Worker } from 'bullmq';
import { db } from '@/db';
import { tickets } from '@/db/schema';
import { generarTicketPDF } from '@/lib/ticket';
import { Resend } from 'resend';

// Convertir la URL de Redis a objeto de conexión (evita conflictos de tipos)
const redisUrl = new URL(process.env.REDIS_URL!);
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  password: redisUrl.password,
  maxRetriesPerRequest: null,
};

const resend = new Resend(process.env.RESEND_API_KEY);

export const ticketsWorker = new Worker(
  'tickets',
  async (job) => {
    const { pagoId, folio, email } = job.data;

    const pago = await db.query.pagos.findFirst({
      where: (p, { eq }) => eq(p.id, pagoId),
      with: { perfil: { with: { usuario: true } } },
    });
    if (!pago) throw new Error('Pago no encontrado');

    const pdfBuffer = await generarTicketPDF({
      folio,
      nombre: pago.perfil?.usuario?.name ?? 'Residente',
      mes: pago.mes,
      anio: pago.anio,
      monto: pago.monto.toString(),
    });

    await resend.emails.send({
      from: 'Agua Fraccionamiento <contactoservicio4soles@gmail.com>', // Cambia por un dominio verificado en Resend
      to: email,
      subject: `Comprobante de pago ${folio}`,
      html: `<h1>Pago registrado</h1><p>Folio: ${folio}</p>`,
      attachments: [{ filename: `${folio}.pdf`, content: pdfBuffer }],
    });
  },
  { connection }
);

console.log('Worker de tickets iniciado');