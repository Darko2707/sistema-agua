export type MercadoPagoPeriodConflict = {
  mes: number;
  anio: number;
  existingPaymentId: string | null;
  existingPerfilId?: string;
};

/**
 * El cobro fue aprobado, pero al menos uno de sus periodos ya fue acreditado
 * por otro pago. Nunca debe convertirse este caso en un replay exitoso.
 */
export class MercadoPagoPeriodConflictError extends Error {
  readonly code = 'MERCADO_PAGO_PERIOD_CONFLICT';

  constructor(
    readonly requestedPaymentId: string,
    readonly conflicts: MercadoPagoPeriodConflict[],
  ) {
    super('El cobro o uno de sus periodos ya fue acreditado de forma incompatible');
    this.name = 'MercadoPagoPeriodConflictError';
  }
}
