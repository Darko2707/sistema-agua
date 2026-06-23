export type EmailPagoConfirmado = {
  to: string;
  nombre: string;
  folio: string;
  mes: number;
  anio: number;
  monto: string;
  pdfUrl?: string;
};

export interface EmailService {
  enviarConfirmacionPago(data: EmailPagoConfirmado): Promise<void>;
}
