export type MercadoPagoPaymentIntentConflictReason =
  | 'not_found'
  | 'profile_mismatch'
  | 'circuit_mismatch'
  | 'currency_mismatch'
  | 'periods_mismatch'
  | 'total_mismatch'
  | 'collector_mismatch'
  | 'already_consumed';

/**
 * El pago fue verificado, pero la intencion persistida ya no coincide con los
 * datos que se intentan acreditar. Es un conflicto permanente y nunca debe
 * transformarse en una acreditacion parcial.
 */
export class MercadoPagoPaymentIntentConflictError extends Error {
  readonly code = 'MERCADO_PAGO_PAYMENT_INTENT_CONFLICT';

  constructor(
    readonly paymentIntentReference: string,
    readonly requestedPaymentId: string,
    readonly reason: MercadoPagoPaymentIntentConflictReason,
  ) {
    super('La intencion de pago no coincide con la acreditacion solicitada');
    this.name = 'MercadoPagoPaymentIntentConflictError';
  }
}
