import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { cargosServicios, fraccionamientoServicios, perfilesServicios, servicios } from '@/db/schema';
import { subscriptionService } from './subscription.service';

export type ServiceChargePeriod = {
  fraccionamientoId: string;
  mes: number;
  anio: number;
};

/**
 * Genera los cargos de servicios de un periodo de forma idempotente.
 * El servicio de agua queda fuera porque conserva el flujo contable existente.
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

  const candidates = rows.filter(row => row.clave !== 'agua');
  if (candidates.length === 0) return { generados: 0, candidatos: 0 };

  const inserted = await db.transaction(async tx => tx.insert(cargosServicios).values(candidates.map(row => ({
    fraccionamientoId: row.fraccionamientoId,
    perfilId: row.perfilId,
    fraccionamientoServicioId: row.fraccionamientoServicioId,
    mes: input.mes,
    anio: input.anio,
    monto: row.monto,
    estado: 'pendiente' as const,
  }))).onConflictDoNothing().returning({ id: cargosServicios.id }));

  return { generados: inserted.length, candidatos: candidates.length };
}
