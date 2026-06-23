export type RegistrarPagoManualCommand = {
  perfilId: string;
  metodo: 'efectivo' | 'transferencia';
  representanteId: string;
};
