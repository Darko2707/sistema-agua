import type { MetodoPago } from '../../ports/pago.repository';

export type ProcesarPagoMpCommand = {
  perfilId: string;
  mes: number;
  anio: number;
  monto: string;
  esReconexion: boolean;
  mercadoPagoPaymentId?: string;
  mercadoPagoCollectorId?: string | null;
  metodo: MetodoPago;
};
