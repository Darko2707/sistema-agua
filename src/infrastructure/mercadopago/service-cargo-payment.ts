import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  auditoria,
  cargosServicios,
  circuitos,
  fraccionamientoMetodosPago,
  fraccionamientoServicios,
  mercadoPagoPaymentIntents,
  pagos,
  perfilesResidente,
  servicios,
  tickets,
} from '@/db/schema';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { findMercadoPagoPaymentIntent } from './payment-intent';

export const SERVICE_CARGO_REFERENCE = /^serv_[0-9a-f-]{36}$/;

/** Error esperado del webhook: se reconoce el evento, pero no se acredita. */
export class ServiceCargoPaymentValidationError extends Error {
  readonly code = 'SERVICE_CARGO_PAYMENT_INVALID';
}

export function isServiceCargoReference(value: string | null): value is string {
  return value !== null && SERVICE_CARGO_REFERENCE.test(value);
}

export async function processServiceCargoPayment(input: { reference: string; paymentId: string }) {
  const cargoId = input.reference.slice(5);
  const [row] = await db.select({
    cargo: cargosServicios,
    perfil: perfilesResidente,
    circuito: circuitos,
    servicio: servicios.clave,
    accessToken: fraccionamientoMetodosPago.accessTokenCifrado,
    collectorId: fraccionamientoMetodosPago.collectorId,
  }).from(cargosServicios)
    .innerJoin(perfilesResidente, eq(perfilesResidente.id, cargosServicios.perfilId))
    .innerJoin(circuitos, eq(circuitos.id, perfilesResidente.circuitoId))
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .leftJoin(fraccionamientoMetodosPago, and(
      eq(fraccionamientoMetodosPago.fraccionamientoId, cargosServicios.fraccionamientoId),
      eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
      eq(fraccionamientoMetodosPago.activo, true),
    ))
    .where(and(eq(cargosServicios.id, cargoId), eq(cargosServicios.fraccionamientoId, perfilesResidente.fraccionamientoId)))
    .limit(1);
  if (!row) throw new ServiceCargoPaymentValidationError('Cargo de servicio no encontrado');
  const intent = await findMercadoPagoPaymentIntent(input.reference);
  if (intent && (
    intent.tipo !== 'servicio' ||
    intent.cargoServicioId !== cargoId ||
    intent.perfilId !== row.cargo.perfilId ||
    intent.fraccionamientoId !== row.cargo.fraccionamientoId ||
    intent.circuitoId !== row.perfil.circuitoId
  )) {
    throw new ServiceCargoPaymentValidationError('La intencion de servicio no coincide con el cargo');
  }
  if (intent?.mercadoPagoPaymentId && intent.mercadoPagoPaymentId !== input.paymentId) {
    throw new ServiceCargoPaymentValidationError('La intencion ya fue consumida por otro pago');
  }
  if (row.cargo.estado === 'pagado') {
    if (row.cargo.mercadoPagoPaymentId === input.paymentId) return { alreadyProcessed: true };
    throw new ServiceCargoPaymentValidationError('El cargo de servicio ya fue pagado con otro paymentId');
  }
  const accessToken = decryptTokenSafe(row.accessToken ?? row.circuito.mercadoPagoAccessToken);
  if (!accessToken) throw new Error('Fraccionamiento sin credenciales de Mercado Pago');
  const { paymentClient } = createMercadoPagoClients(accessToken);
  const payment = await paymentClient.get({ id: input.paymentId });
  if (String(payment.id ?? '') !== input.paymentId) throw new ServiceCargoPaymentValidationError('paymentId inconsistente');
  if (payment.external_reference !== input.reference) throw new ServiceCargoPaymentValidationError('Referencia de cargo inconsistente');
  if (payment.status !== 'approved' || payment.currency_id !== 'MXN') throw new ServiceCargoPaymentValidationError('Pago de servicio no aprobado');
  const montoRecibido = Number(payment.transaction_amount ?? -1);
  const montoEsperado = Number(row.cargo.monto);
  const montoIntent = intent ? Number(intent.total) : montoEsperado;
  if (Math.round(montoRecibido * 100) !== Math.round(montoIntent * 100)) {
    // Conserva evidencia para conciliación manual de pagos parciales o
    // sobrepagos; el cargo permanece pendiente y nunca se acredita por error.
    await db.insert(auditoria).values({
      accion: 'servicio.cargo.pago_rechazado_monto',
      entidad: 'cargos_servicios',
      entidadId: cargoId,
      detalle: {
        paymentId: input.paymentId,
        montoRecibido,
        montoEsperado: montoIntent,
        perfilId: row.cargo.perfilId,
        fraccionamientoId: row.cargo.fraccionamientoId,
      },
    });
    throw new ServiceCargoPaymentValidationError('Monto del cargo de servicio invalido');
  }
  const collectorEsperado = intent ? intent.collectorId : row.collectorId;
  if (collectorEsperado && String(payment.collector_id ?? '') !== collectorEsperado) throw new ServiceCargoPaymentValidationError('Collector de servicio invalido');

  return db.transaction(async (tx) => {
    // Serializa todos los webhooks que intenten acreditar el mismo pago,
    // incluso si apuntan a cargos distintos.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.paymentId}, 0))`);

    if (intent) {
      await tx.execute(sql`SELECT external_reference FROM mercado_pago_payment_intents WHERE external_reference = ${input.reference} FOR UPDATE`);
      const [currentIntent] = await tx.select({
        mercadoPagoPaymentId: mercadoPagoPaymentIntents.mercadoPagoPaymentId,
      }).from(mercadoPagoPaymentIntents)
        .where(eq(mercadoPagoPaymentIntents.externalReference, input.reference))
        .limit(1);
      if (!currentIntent) {
        throw new ServiceCargoPaymentValidationError('La intencion de servicio ya no existe');
      }
      if (currentIntent?.mercadoPagoPaymentId && currentIntent.mercadoPagoPaymentId !== input.paymentId) {
        throw new ServiceCargoPaymentValidationError('La intencion ya fue consumida por otro pago');
      }
    }

    const [existingPayment] = await tx.select({
      id: cargosServicios.id,
      estado: cargosServicios.estado,
      mercadoPagoPaymentId: cargosServicios.mercadoPagoPaymentId,
    }).from(cargosServicios)
      .where(eq(cargosServicios.mercadoPagoPaymentId, input.paymentId))
      .limit(1);
    if (existingPayment && existingPayment.id !== cargoId) {
      throw new ServiceCargoPaymentValidationError('El paymentId de Mercado Pago ya fue aplicado a otro cargo');
    }
    if (existingPayment?.id === cargoId && existingPayment.estado === 'pagado') {
      return { alreadyProcessed: true };
    }

    // Bloquea el cargo antes de comprobar su estado y acreditarlo.
    await tx.execute(sql`SELECT id FROM cargos_servicios WHERE id = ${cargoId} FOR UPDATE`);
    if (row.servicio === 'agua') {
      const [existingWaterPayment] = await tx.select({
        id: pagos.id,
        mercadoPagoPaymentId: pagos.mercadoPagoPaymentId,
      }).from(pagos).where(and(
        eq(pagos.perfilId, row.cargo.perfilId),
        eq(pagos.circuitoId, row.perfil.circuitoId),
        eq(pagos.mes, row.cargo.mes),
        eq(pagos.anio, row.cargo.anio),
        eq(pagos.estado, 'pagado'),
      )).limit(1);
      if (existingWaterPayment) {
        if (existingWaterPayment.mercadoPagoPaymentId === input.paymentId) {
          await tx.update(cargosServicios).set({
            estado: 'pagado',
            metodo: 'mercado_pago',
            mercadoPagoPaymentId: input.paymentId,
            folio: `SRV-${input.paymentId}`,
            pagadoEn: new Date(),
          }).where(and(eq(cargosServicios.id, cargoId), eq(cargosServicios.estado, 'pendiente')));
          return { alreadyProcessed: true };
        }
        throw new ServiceCargoPaymentValidationError('El periodo de agua ya fue pagado con otro paymentId');
      }
      const [waterPayment] = await tx.insert(pagos).values({
        fraccionamientoId: row.cargo.fraccionamientoId,
        perfilId: row.cargo.perfilId,
        circuitoId: row.perfil.circuitoId,
        representanteId: row.circuito.representanteId,
        mes: row.cargo.mes,
        anio: row.cargo.anio,
        monto: row.cargo.monto,
        montoBase: row.cargo.monto,
        iva: '0.00',
        comisionMercadoPago: '0.00',
        retencionIsr: '0.00',
        retencionIva: '0.00',
        montoNetoRepresentante: row.cargo.monto,
        mercadoPagoPaymentId: input.paymentId,
        mercadoPagoCollectorId: collectorEsperado,
        estado: 'pagado',
        metodo: 'mercado_pago',
        folio: `SRV-${input.paymentId}`,
        esReconexion: false,
        fechaPago: new Date(),
      }).returning({ id: pagos.id, folio: pagos.folio });
      if (!waterPayment) throw new Error('No se pudo crear el pago de agua');
      await tx.insert(tickets).values({
        pagoId: waterPayment.id,
        cargoServicioId: null,
        tipo: 'agua',
        folio: waterPayment.folio!,
        pdfUrl: null,
      });
    }
    const [updated] = await tx.update(cargosServicios).set({
      estado: 'pagado',
      metodo: 'mercado_pago',
      mercadoPagoPaymentId: input.paymentId,
      folio: `SRV-${input.paymentId}`,
      pagadoEn: new Date(),
    }).where(and(eq(cargosServicios.id, cargoId), eq(cargosServicios.estado, 'pendiente'))).returning({ id: cargosServicios.id });
    if (!updated) {
      const [current] = await tx.select({ estado: cargosServicios.estado, mercadoPagoPaymentId: cargosServicios.mercadoPagoPaymentId })
        .from(cargosServicios).where(eq(cargosServicios.id, cargoId)).limit(1);
      if (current?.estado === 'pagado' && current.mercadoPagoPaymentId === input.paymentId) {
        return { alreadyProcessed: true };
      }
      if (current && current.estado !== 'pendiente') {
        throw new ServiceCargoPaymentValidationError('El cargo de servicio ya no está pendiente');
      }
      throw new Error('El cargo fue procesado concurrentemente');
    }
    if (row.servicio !== 'agua') {
      // Cada cargo de un servicio no hídrico tiene su propio comprobante.
      // Se crea en la misma transacción que la acreditación para que nunca
      // exista un cargo pagado sin folio o un folio sin pago confirmado.
      await tx.insert(tickets).values({
        pagoId: null,
        cargoServicioId: cargoId,
        tipo: 'servicio',
        folio: `SRV-${input.paymentId}`,
        pdfUrl: null,
      });
    }
    if (intent) {
      await tx.update(mercadoPagoPaymentIntents).set({
        mercadoPagoPaymentId: input.paymentId,
        consumedAt: new Date(),
      }).where(eq(mercadoPagoPaymentIntents.externalReference, input.reference));
    }
    await tx.insert(auditoria).values({
      accion: 'servicio.cargo.pagado_mercado_pago',
      entidad: 'cargos_servicios',
      entidadId: cargoId,
      detalle: { paymentId: input.paymentId, perfilId: row.cargo.perfilId, fraccionamientoId: row.cargo.fraccionamientoId },
    });
    return { alreadyProcessed: false };
  });
}
