import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { auditoria, cargosServicios, circuitos, fraccionamientoMetodosPago, perfilesResidente } from '@/db/schema';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';

export const SERVICE_CARGO_REFERENCE = /^serv_[0-9a-f-]{36}$/;

export function isServiceCargoReference(value: string | null): value is string {
  return value !== null && SERVICE_CARGO_REFERENCE.test(value);
}

export async function processServiceCargoPayment(input: { reference: string; paymentId: string }) {
  const cargoId = input.reference.slice(5);
  const [row] = await db.select({
    cargo: cargosServicios,
    perfil: perfilesResidente,
    circuito: circuitos,
    accessToken: fraccionamientoMetodosPago.accessTokenCifrado,
    collectorId: fraccionamientoMetodosPago.collectorId,
  }).from(cargosServicios)
    .innerJoin(perfilesResidente, eq(perfilesResidente.id, cargosServicios.perfilId))
    .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
    .leftJoin(fraccionamientoMetodosPago, and(
      eq(fraccionamientoMetodosPago.fraccionamientoId, cargosServicios.fraccionamientoId),
      eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
      eq(fraccionamientoMetodosPago.activo, true),
    ))
    .where(and(eq(cargosServicios.id, cargoId), eq(cargosServicios.fraccionamientoId, perfilesResidente.fraccionamientoId)))
    .limit(1);
  if (!row) throw new Error('Cargo de servicio no encontrado');
  if (row.cargo.estado === 'pagado') {
    if (row.cargo.mercadoPagoPaymentId === input.paymentId) return { alreadyProcessed: true };
    throw new Error('El cargo de servicio ya fue pagado con otro paymentId');
  }
  const accessToken = decryptTokenSafe(row.accessToken ?? row.circuito.mercadoPagoAccessToken);
  if (!accessToken) throw new Error('Fraccionamiento sin credenciales de Mercado Pago');
  const { paymentClient } = createMercadoPagoClients(accessToken);
  const payment = await paymentClient.get({ id: input.paymentId });
  if (String(payment.id ?? '') !== input.paymentId) throw new Error('paymentId inconsistente');
  if (payment.external_reference !== input.reference) throw new Error('Referencia de cargo inconsistente');
  if (payment.status !== 'approved' || payment.currency_id !== 'MXN') throw new Error('Pago de servicio no aprobado');
  if (Math.round(Number(payment.transaction_amount ?? -1) * 100) !== Math.round(Number(row.cargo.monto) * 100)) {
    throw new Error('Monto del cargo de servicio invalido');
  }
  if (row.collectorId && String(payment.collector_id ?? '') !== row.collectorId) throw new Error('Collector de servicio invalido');

  const [updated] = await db.update(cargosServicios).set({
    estado: 'pagado',
    metodo: 'mercado_pago',
    mercadoPagoPaymentId: input.paymentId,
    folio: `SRV-${input.paymentId}`,
    pagadoEn: new Date(),
  }).where(and(eq(cargosServicios.id, cargoId), eq(cargosServicios.estado, 'pendiente'))).returning({ id: cargosServicios.id });
  if (!updated) throw new Error('El cargo fue procesado concurrentemente');
  await db.insert(auditoria).values({
    accion: 'servicio.cargo.pagado_mercado_pago',
    entidad: 'cargos_servicios',
    entidadId: cargoId,
    detalle: { paymentId: input.paymentId, perfilId: row.cargo.perfilId, fraccionamientoId: row.cargo.fraccionamientoId },
  });
  return { alreadyProcessed: false };
}
