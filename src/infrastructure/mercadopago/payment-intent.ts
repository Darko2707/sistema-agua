import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { cargosServicios, mercadoPagoPaymentIntents, perfilesResidente } from '@/db/schema';

export const MERCADO_PAGO_INTENT_REFERENCE_PATTERN = /^(agua_[a-f0-9]{48}|serv_[0-9a-f-]{36})$/;
export type MercadoPagoPaymentIntentTipo = 'agua' | 'servicio';

const MoneySchema = z.string().regex(/^\d{1,8}\.\d{2}$/);
const PaymentIntentPeriodSchema = z.object({
  mes: z.number().int().min(1).max(12),
  anio: z.number().int().min(2020).max(2100),
  monto: MoneySchema,
  esReconexion: z.boolean(),
}).strict();

const PaymentIntentRowSchema = z.object({
  externalReference: z.string().regex(MERCADO_PAGO_INTENT_REFERENCE_PATTERN),
  tipo: z.enum(['agua', 'servicio']).default('agua'),
  fraccionamientoId: z.string().uuid(),
  perfilId: z.string().uuid(),
  circuitoId: z.string().uuid(),
  cargoServicioId: z.string().uuid().nullable().default(null),
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
  tipo?: MercadoPagoPaymentIntentTipo;
  perfilId: string;
  circuitoId: string;
  cargoServicioId?: string | null;
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
    stored.tipo === (input.tipo ?? 'agua') &&
    stored.perfilId === input.perfilId &&
    stored.circuitoId === input.circuitoId &&
    stored.cargoServicioId === (input.cargoServicioId ?? null) &&
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

  const [perfil] = await db
    .select({ fraccionamientoId: perfilesResidente.fraccionamientoId, circuitoId: perfilesResidente.circuitoId })
    .from(perfilesResidente)
    .where(eq(perfilesResidente.id, input.perfilId))
    .limit(1);
  if (!perfil?.fraccionamientoId) throw new Error('El perfil no tiene fraccionamiento asignado');
  const tipo = input.tipo ?? (input.externalReference.startsWith('serv_') ? 'servicio' : 'agua');
  if ((tipo === 'agua') !== input.externalReference.startsWith('agua_')) {
    throw new Error('El tipo no coincide con la referencia de la intencion');
  }
  if (perfil.circuitoId && perfil.circuitoId !== input.circuitoId) throw new Error('El circuito no pertenece al perfil');
  if (tipo === 'agua' && input.cargoServicioId) throw new Error('Una intencion de agua no puede tener cargo de servicio');
  if (tipo === 'servicio' && !input.cargoServicioId) throw new Error('La intencion de servicio requiere un cargo');
  if (tipo === 'servicio' && input.cargoServicioId) {
    const [cargo] = await db.select({
      id: cargosServicios.id,
      perfilId: cargosServicios.perfilId,
      fraccionamientoId: cargosServicios.fraccionamientoId,
      monto: cargosServicios.monto,
      estado: cargosServicios.estado,
    }).from(cargosServicios).where(and(
      eq(cargosServicios.id, input.cargoServicioId),
      eq(cargosServicios.perfilId, input.perfilId),
      eq(cargosServicios.fraccionamientoId, perfil.fraccionamientoId),
    )).limit(1);
    if (!cargo || cargo.estado !== 'pendiente') throw new Error('El cargo de servicio no esta pendiente');
    if (Number(cargo.monto).toFixed(2) !== Number(input.total).toFixed(2)) {
      throw new Error('El total de la intencion no coincide con el cargo');
    }
  }

  const [inserted] = await db
    .insert(mercadoPagoPaymentIntents)
    .values({
      externalReference: input.externalReference,
      tipo,
      fraccionamientoId: perfil.fraccionamientoId,
      perfilId: input.perfilId,
      circuitoId: input.circuitoId,
      cargoServicioId: input.cargoServicioId ?? null,
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
  const normalizedInput = {
    ...input,
    tipo,
    cargoServicioId: input.cargoServicioId ?? null,
    collectorId: input.collectorId?.trim() || null,
  };
  if (
    intent.tipo === 'servicio' &&
    !intent.mercadoPagoPaymentId &&
    intent.expiresAt.getTime() <= Date.now()
  ) {
    // Los cargos de servicio conservan una referencia estable por cargo. Si
    // la preferencia expiró, se renueva la intención sin cambiar su identidad
    // ni permitir una segunda intención concurrente para el mismo cargo.
    assertSameIntent(intent, { ...normalizedInput, expiresAt: intent.expiresAt });
    const [refreshed] = await db.update(mercadoPagoPaymentIntents)
      .set({ expiresAt: input.expiresAt })
      .where(eq(mercadoPagoPaymentIntents.externalReference, input.externalReference))
      .returning();
    return parseIntentRow(refreshed ?? { ...row, expiresAt: input.expiresAt });
  }
  assertSameIntent(intent, normalizedInput);
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
