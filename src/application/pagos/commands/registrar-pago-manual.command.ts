export type RegistrarPagoManualCommand = {
  perfilId: string;
  metodo: 'efectivo' | 'transferencia';
  representanteId: string;
  fraccionamientoId?: string;
  montoMensual?: string;
  montoReconexion?: string;
  mercadoPagoCollectorId?: string | null;
};
