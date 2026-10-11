import { and, eq, ne } from 'drizzle-orm';

import { db } from '@/db';
import { cargosServicios, fraccionamientoServicios, perfilesResidente, perfilesServicios, servicios, user } from '@/db/schema';
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
  }).from(perfilesServicios)
    .innerJoin(perfilesResidente, eq(perfilesResidente.id, perfilesServicios.perfilId))
    .innerJoin(user, eq(user.id, perfilesResidente.userId))
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, perfilesServicios.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(
      eq(perfilesServicios.fraccionamientoId, input.fraccionamientoId),
      eq(perfilesServicios.activo, true),
      eq(user.responsableCargos, true),
      eq(fraccionamientoServicios.estado, 'activo'),
      eq(servicios.activo, true),
      ne(servicios.clave, 'agua'),
    ));

  if (rows.length === 0) return { generados: 0, candidatos: 0 };

  const inserted = await db.transaction(async tx => tx.insert(cargosServicios).values(rows.map(row => {
    return {
      // The tenant is already constrained by the query; use the validated input
      // because legacy TypeScript rows may still expose a nullable column.
      fraccionamientoId: input.fraccionamientoId,
      perfilId: row.perfilId,
      fraccionamientoServicioId: row.fraccionamientoServicioId,
      mes: input.mes,
      anio: input.anio,
      monto: row.monto,
      estado: 'pendiente' as const,
      metodo: null,
      mercadoPagoPaymentId: null,
      folio: null,
      pagadoEn: null,
    };
  })).onConflictDoNothing().returning({ id: cargosServicios.id }));

  return { generados: inserted.length, candidatos: rows.length };
}
