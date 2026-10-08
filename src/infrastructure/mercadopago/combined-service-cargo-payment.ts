import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { auditoria, cargosServicios, fraccionamientoServicios, mercadoPagoPaymentIntents, servicios, tickets } from '@/db/schema';
import { generarFolioServicio } from '@/src/domain/pagos/folio.vo';

/** Error controlado: el webhook se reconoce pero no acredita conceptos ajenos. */
export class CombinedServiceCargoPaymentValidationError extends Error {}

/**
 * Acredita exclusivamente los cargos congelados en una intención mixta.
 * Se bloquean intención y cargos para que los reintentos del webhook sean
 * idempotentes. Los cargos de agua nunca entran aquí: se acreditan en pagos.
 */
export async function processCombinedServiceCargos(input: {
  reference: string;
  paymentId: string;
  perfilId: string;
  fraccionamientoId: string;
  cargoIds: string[];
}) {
  if (input.cargoIds.length === 0) return { alreadyProcessed: true };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.paymentId}, 0))`);
    await tx.execute(sql`SELECT external_reference FROM mercado_pago_payment_intents WHERE external_reference = ${input.reference} FOR UPDATE`);
    const [intent] = await tx.select({ tipo: mercadoPagoPaymentIntents.tipo, cargoIds: mercadoPagoPaymentIntents.cargosServicioIds, paymentId: mercadoPagoPaymentIntents.mercadoPagoPaymentId }).from(mercadoPagoPaymentIntents).where(eq(mercadoPagoPaymentIntents.externalReference, input.reference)).limit(1);
    if (!intent || intent.tipo !== 'mixto' || intent.paymentId && intent.paymentId !== input.paymentId) {
      throw new CombinedServiceCargoPaymentValidationError('La intención combinada no es válida');
    }
    const frozen = [...intent.cargoIds].sort();
    const requested = [...input.cargoIds].sort();
    if (JSON.stringify(frozen) !== JSON.stringify(requested)) {
      throw new CombinedServiceCargoPaymentValidationError('Los cargos no coinciden con la intención');
    }
    await tx.execute(sql`SELECT id FROM cargos_servicios WHERE id = ANY(${input.cargoIds}::uuid[]) FOR UPDATE`);
    const rows = await tx.select({ id: cargosServicios.id, estado: cargosServicios.estado, paymentId: cargosServicios.mercadoPagoPaymentId }).from(cargosServicios).innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId)).innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId)).where(and(inArray(cargosServicios.id, input.cargoIds), eq(cargosServicios.perfilId, input.perfilId), eq(cargosServicios.fraccionamientoId, input.fraccionamientoId), ne(servicios.clave, 'agua')));
    if (rows.length !== input.cargoIds.length || rows.some(row => row.estado === 'pagado' && row.paymentId !== input.paymentId) || rows.some(row => row.estado !== 'pendiente' && row.estado !== 'pagado')) {
      throw new CombinedServiceCargoPaymentValidationError('Uno o más cargos ya no son acreditables');
    }
    const pending = rows.filter(row => row.estado === 'pendiente');
    for (const row of pending) {
      const folio = generarFolioServicio();
      const [updated] = await tx.update(cargosServicios).set({ estado: 'pagado', metodo: 'mercado_pago', mercadoPagoPaymentId: input.paymentId, folio, pagadoEn: new Date() }).where(and(eq(cargosServicios.id, row.id), eq(cargosServicios.estado, 'pendiente'))).returning({ id: cargosServicios.id });
      if (!updated) throw new CombinedServiceCargoPaymentValidationError('Un cargo cambió durante la acreditación');
      await tx.insert(tickets).values({ pagoId: null, cargoServicioId: row.id, tipo: 'servicio', folio, pdfUrl: null });
      await tx.insert(auditoria).values({ accion: 'servicio.cargo.pagado_mercado_pago_combinado', entidad: 'cargos_servicios', entidadId: row.id, detalle: { paymentId: input.paymentId, perfilId: input.perfilId, fraccionamientoId: input.fraccionamientoId } });
    }
    if (!intent.paymentId) await tx.update(mercadoPagoPaymentIntents).set({ mercadoPagoPaymentId: input.paymentId, consumedAt: new Date() }).where(eq(mercadoPagoPaymentIntents.externalReference, input.reference));
    return { alreadyProcessed: pending.length === 0 };
  });
}
