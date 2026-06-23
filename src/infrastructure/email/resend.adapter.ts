import type { EmailService, EmailPagoConfirmado } from '@/src/application/ports/email';

export class ResendEmailAdapter implements EmailService {
  async enviarConfirmacionPago(data: EmailPagoConfirmado): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'noreply@sistema-agua.com',
        to:      data.to,
        subject: `Confirmación de pago — ${MESES[data.mes - 1]} ${data.anio}`,
        html:    `<p>Hola ${data.nombre}, tu pago de $${data.monto} MXN ha sido confirmado.</p><p>Folio: <strong>${data.folio}</strong></p>`,
      }),
    });
  }
}
