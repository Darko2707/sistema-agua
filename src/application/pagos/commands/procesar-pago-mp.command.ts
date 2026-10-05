export type ProcesarPagoMpPeriodo = {
  mes: number;
  anio: number;
  monto: string;
  esReconexion: boolean;
};

export type ProcesarPagoMpCommand = {
  perfilId: string;
  fraccionamientoId?: string;
  circuitoId: string;
  paymentIntentReference?: string;
  periodos: ProcesarPagoMpPeriodo[];
  mercadoPagoPaymentId: string;
  mercadoPagoCollectorId?: string | null;
  metodo: 'mercado_pago';
};
