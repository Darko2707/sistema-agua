import { db } from '@/db';
import { decryptTokenSafe } from '@/lib/crypto';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { calcularDesglosePago, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { expandExternalReference, parseExternalReference } from './parser';
import {
  findMercadoPagoPaymentIntent,
  isMercadoPagoPaymentIntentReference,
} from './payment-intent';

type ValidationReason =
  | 'invalid_reference'
  | 'profile_not_found'
  | 'circuit_mismatch'
  | 'missing_access_token'
  | 'payment_id_mismatch'
  | 'reference_mismatch'
  | 'invalid_status'
  | 'invalid_currency'
  | 'invalid_amount'
  | 'collector_mismatch'
  | 'intent_not_found'
  | 'intent_already_consumed'
  | 'duplicate_period';

export class MercadoPagoPaymentValidationError extends Error {
  constructor(
    readonly reason: ValidationReason,
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoPaymentValidationError';
  }
}

export type VerifiedMercadoPagoPayment = {
  paymentId: string;
  status: string;
  collectorId?: string;
  perfilId: string;
  circuitoId: string;
  paymentIntentReference?: string;
  expectedTotal: string;
  periodos: Array<{
    mes: number;
    anio: number;
    monto: string;
    esReconexion: boolean;
  }>;
};

function paymentAmountInCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function moneyInCents(value: string): number {
  return Math.round(Number(value) * 100);
}

/**
 * Fetches a payment with the credentials belonging to the profile encoded in
 * the callback reference, then binds every security-sensitive field back to
 * that same server-side profile and circuit configuration.
 */
export async function fetchVerifiedMercadoPagoPayment(input: {
  externalReference: string | null;
  paymentId: string;
}): Promise<VerifiedMercadoPagoPayment> {
  if (!input.externalReference) {
    throw new MercadoPagoPaymentValidationError('invalid_reference', 'Referencia de pago invalida');
  }

  const isIntentReference = isMercadoPagoPaymentIntentReference(input.externalReference);
  const intent = isIntentReference
    ? await findMercadoPagoPaymentIntent(input.externalReference)
    : null;
  if (isIntentReference && !intent) {
    throw new MercadoPagoPaymentValidationError('intent_not_found', 'Intencion de pago no encontrada');
  }

  const legacyReference = intent ? null : parseExternalReference(input.externalReference);
  if (!intent && !legacyReference) {
    throw new MercadoPagoPaymentValidationError('invalid_reference', 'Referencia de pago invalida');
  }
  const perfilId = intent?.perfilId ?? legacyReference!.perfilId;

  const perfil = await db.query.perfilesResidente.findFirst({
    where: (row, { eq }) => eq(row.id, perfilId),
    columns: {
      id:         true,
      circuitoId: true,
    },
    with: {
      circuito: {
        columns: {
          id:                     true,
          montoMensual:           true,
          montoReconexion:        true,
          mercadoPagoAccessToken: true,
          mercadoPagoCollectorId: true,
        },
      },
    },
  });

  if (!perfil) {
    throw new MercadoPagoPaymentValidationError('profile_not_found', 'Perfil de pago no encontrado');
  }
  if (
    !perfil.circuito ||
    perfil.circuitoId !== perfil.circuito.id ||
    (intent && intent.circuitoId !== perfil.circuito.id)
  ) {
    throw new MercadoPagoPaymentValidationError('circuit_mismatch', 'Circuito de pago inconsistente');
  }

  const accessToken = decryptTokenSafe(perfil.circuito.mercadoPagoAccessToken);
  if (!accessToken) {
    throw new MercadoPagoPaymentValidationError('missing_access_token', 'Circuito sin credenciales de Mercado Pago');
  }

  const { paymentClient } = createMercadoPagoClients(accessToken);
  const payment = await paymentClient.get({ id: input.paymentId });
  const returnedPaymentId = payment.id === undefined ? null : String(payment.id);
  if (returnedPaymentId !== input.paymentId) {
    throw new MercadoPagoPaymentValidationError('payment_id_mismatch', 'Mercado Pago devolvio otro paymentId');
  }
  if (payment.external_reference !== input.externalReference) {
    throw new MercadoPagoPaymentValidationError('reference_mismatch', 'La referencia no pertenece al pago consultado');
  }
  if (typeof payment.status !== 'string' || payment.status.length === 0) {
    throw new MercadoPagoPaymentValidationError('invalid_status', 'El pago no contiene un estado valido');
  }
  if (payment.currency_id !== 'MXN') {
    throw new MercadoPagoPaymentValidationError('invalid_currency', 'La moneda del pago no es MXN');
  }

  if (
    intent?.mercadoPagoPaymentId &&
    intent.mercadoPagoPaymentId !== returnedPaymentId
  ) {
    throw new MercadoPagoPaymentValidationError(
      'intent_already_consumed',
      'La intencion ya fue consumida por otro pago',
    );
  }

  // New opaque intents freeze the exact periods and amounts at checkout time.
  // Legacy references remain readable while already-issued preferences expire.
  const expanded = intent
    ? intent.periodos
    : expandExternalReference(legacyReference!);
  const periodKeys = new Set<string>();
  const periodos = expanded.map((periodo, index) => {
    const { mes, anio } = periodo;
    const key = `${anio}-${mes}`;
    if (periodKeys.has(key)) {
      throw new MercadoPagoPaymentValidationError('duplicate_period', 'La referencia contiene periodos duplicados');
    }
    periodKeys.add(key);

    if (intent) return periodo;

    const esReconexion = index === 0 && legacyReference!.esReconexion;
    return {
      mes,
      anio,
      monto: calcularMontoBase(
        perfil.circuito.montoMensual,
        esReconexion,
        perfil.circuito.montoReconexion,
      ).toFixed(2),
      esReconexion,
    };
  });

  const montoBase = intent
    ? null
    : Number(perfil.circuito.montoMensual) * periodos.length +
      (legacyReference!.esReconexion ? Number(perfil.circuito.montoReconexion) : 0);
  const expectedTotal = intent
    ? intent.total
    : calcularDesglosePago(montoBase!).total;
  if (paymentAmountInCents(payment.transaction_amount) !== moneyInCents(expectedTotal)) {
    throw new MercadoPagoPaymentValidationError('invalid_amount', 'El importe del pago no coincide con la configuracion del circuito');
  }

  const configuredCollector = intent
    ? intent.collectorId
    : perfil.circuito.mercadoPagoCollectorId?.trim();
  const paymentCollector = payment.collector_id === undefined ? undefined : String(payment.collector_id);
  if (configuredCollector && paymentCollector !== configuredCollector) {
    throw new MercadoPagoPaymentValidationError('collector_mismatch', 'El cobrador del pago no coincide con el circuito');
  }

  return {
    paymentId: returnedPaymentId,
    status: payment.status,
    collectorId: paymentCollector,
    perfilId: perfil.id,
    circuitoId: perfil.circuito.id,
    paymentIntentReference: intent?.externalReference,
    expectedTotal,
    periodos,
  };
}
