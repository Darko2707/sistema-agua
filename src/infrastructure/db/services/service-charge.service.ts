import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { cargosServicios, fraccionamientoServicios, pagos, perfilesServicios, servicios } from '@/db/schema';
import { subscriptionService } from './subscription.service';

export type ServiceChargePeriod = {
  fraccionamientoId: string;
  mes: number;
  anio: number;
};

/**
 * Genera cargos de servicios de forma idempotente.
 *
 * Agua también es un servicio del catálogo; su única particularidad es
 * `con_corte_fisico`, que pertenece a la operación y no a la facturación.
 * Los pagos históricos de agua se utilizan para crear el cargo ya pagado y
 * así no duplicar cobros durante la transición del ledger antiguo.
 */
export async function generateMonthlyServiceCharges(input: ServiceChargePeriod) {
  await subscriptionService.requireOperational(input.fraccionamientoId);

  const rows = await db.select({
    perfilId: perfilesServicios.perfilId,
    fraccionamientoServicioId: perfilesServicios.fraccionamientoServicioId,
    fraccionamientoId: perfilesServicios.fraccionamientoId,
    monto: fraccionamientoServicios.montoMensual,
    clave: servicios.clave,
  }).from(perfilesServicios)
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, perfilesServicios.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(perfilesServicios.fraccionamientoId, input.fraccionamientoId),
      eq(perfilesServicios.activo, true),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.activo, true),
    ));

  const paidWater = await db.select({
    perfilId: pagos.perfilId,
    mes: pagos.mes,
    anio: pagos.anio,
    monto: pagos.monto,
    metodo: pagos.metodo,
    mercadoPagoPaymentId: pagos.mercadoPagoPaymentId,
    folio: pagos.folio,
    pagadoEn: pagos.fechaPago,
  }).from(pagos).where(and(
    eq(pagos.fraccionamientoId, input.fraccionamientoId),
    eq(pagos.estado, 'pagado'),
    eq(pagos.mes, input.mes),
    eq(pagos.anio, input.anio),
  ));
  const paidWaterByPeriod = new Map(
    paidWater.map(pago => [`${pago.perfilId}:${pago.mes}:${pago.anio}`, pago] as const),
  );
  const candidates = rows;
  if (candidates.length === 0) return { generados: 0, candidatos: 0 };

  const inserted = await db.transaction(async tx => tx.insert(cargosServicios).values(candidates.map(row => {
    const legacyPago = row.clave === 'agua'
      ? paidWaterByPeriod.get(`${row.perfilId}:${input.mes}:${input.anio}`)
      : undefined;
    const pagoCoincide = legacyPago && Math.round(Number(legacyPago.monto) * 100) === Math.round(Number(row.monto) * 100);
    return {
      // The tenant is already constrained by the query; use the validated input
      // because legacy TypeScript rows may still expose a nullable column.
      fraccionamientoId: input.fraccionamientoId,
      perfilId: row.perfilId,
      fraccionamientoServicioId: row.fraccionamientoServicioId,
      mes: input.mes,
      anio: input.anio,
      monto: row.monto,
      estado: pagoCoincide ? 'pagado' as const : 'pendiente' as const,
      metodo: pagoCoincide ? legacyPago?.metodo ?? null : null,
      mercadoPagoPaymentId: pagoCoincide ? legacyPago?.mercadoPagoPaymentId ?? null : null,
      folio: pagoCoincide ? legacyPago?.folio ?? null : null,
      pagadoEn: pagoCoincide ? legacyPago?.pagadoEn ?? null : null,
    };
  })).onConflictDoNothing().returning({ id: cargosServicios.id }));

  return { generados: inserted.length, candidatos: candidates.length };
}
