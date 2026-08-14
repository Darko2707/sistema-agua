import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { mercadoPagoPaymentIntents } from '@/db/schema';

export const MERCADO_PAGO_INTENT_REFERENCE_PATTERN = /^agua_[a-f0-9]{48}$/;

const MoneySchema = z.string().regex(/^\d{1,8}\.\d{2}$/);
const PaymentIntentPeriodSchema = z.object({
  mes: z.number().int().min(1).max(12),
  anio: z.number().int().min(2020).max(2100),
  monto: MoneySchema,
  esReconexion: z.boolean(),
}).strict();

const PaymentIntentRowSchema = z.object({
  externalReference: z.string().regex(MERCADO_PAGO_INTENT_REFERENCE_PATTERN),
  perfilId: z.string().uuid(),
  circuitoId: z.string().uuid(),
  periodos: z.array(PaymentIntentPeriodSchema).min(1).max(12),
  total: MoneySchema,
  currency: z.literal('MXN'),
  collectorId: z.string().min(1).nullable(),
  expiresAt: z.date(),
  mercadoPagoPaymentId: z.string().nullable(),
  consumedAt: z.date().nullable(),
  createdAt: z.date(),
});

export type MercadoPagoPaymentIntentPeriod = z.infer<typeof PaymentIntentPeriodSchema>;
export type MercadoPagoPaymentIntent = z.infer<typeof PaymentIntentRowSchema>;

export type PersistMercadoPagoPaymentIntentInput = {
  externalReference: string;
  perfilId: string;
  circuitoId: string;
  periodos: MercadoPagoPaymentIntentPeriod[];
  total: string;
  collectorId?: string | null;
  expiresAt: Date;
};

export function isMercadoPagoPaymentIntentReference(value: string): boolean {
  return MERCADO_PAGO_INTENT_REFERENCE_PATTERN.test(value);
}

function parseIntentRow(row: unknown): MercadoPagoPaymentIntent {
  const parsed = PaymentIntentRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new Error('La intencion de pago almacenada es invalida');
  }
  return parsed.data;
}

function assertSameIntent(
  stored: MercadoPagoPaymentIntent,
  input: PersistMercadoPagoPaymentIntentInput,
) {
  const matches =
    stored.perfilId === input.perfilId &&
    stored.circuitoId === input.circuitoId &&
    stored.total === input.total &&
    stored.currency === 'MXN' &&
    stored.collectorId === (input.collectorId ?? null) &&
    stored.expiresAt.getTime() === input.expiresAt.getTime() &&
    JSON.stringify(stored.periodos) === JSON.stringify(input.periodos);

  if (!matches) {
    throw new Error('Colision al persistir la intencion de pago');
  }
}

export async function persistMercadoPagoPaymentIntent(
  input: PersistMercadoPagoPaymentIntentInput,
): Promise<MercadoPagoPaymentIntent> {
  if (!isMercadoPagoPaymentIntentReference(input.externalReference)) {
    throw new Error('Referencia de intencion de pago invalida');
  }

  const [inserted] = await db
    .insert(mercadoPagoPaymentIntents)
    .values({
      externalReference: input.externalReference,
      perfilId: input.perfilId,
      circuitoId: input.circuitoId,
      periodos: input.periodos,
      total: input.total,
      currency: 'MXN',
      collectorId: input.collectorId?.trim() || null,
      expiresAt: input.expiresAt,
    })
    .onConflictDoNothing()
    .returning();

  const row = inserted ?? (await db
    .select()
    .from(mercadoPagoPaymentIntents)
    .where(eq(mercadoPagoPaymentIntents.externalReference, input.externalReference))
    .limit(1))[0];

  if (!row) throw new Error('No se pudo persistir la intencion de pago');
  const intent = parseIntentRow(row);
  assertSameIntent(intent, {
    ...input,
    collectorId: input.collectorId?.trim() || null,
  });
  return intent;
}

export async function findMercadoPagoPaymentIntent(
  externalReference: string,
): Promise<MercadoPagoPaymentIntent | null> {
  if (!isMercadoPagoPaymentIntentReference(externalReference)) return null;

  const [row] = await db
    .select()
    .from(mercadoPagoPaymentIntents)
    .where(eq(mercadoPagoPaymentIntents.externalReference, externalReference))
    .limit(1);

  return row ? parseIntentRow(row) : null;
}
