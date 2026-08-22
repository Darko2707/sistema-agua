import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  auditoria,
  pagos,
  cortes,
  tickets,
  perfilesResidente,
  circuitos,
  notificaciones,
  mercadoPagoPaymentIntents,
} from '@/db/schema';
import type {
  PagoRepository,
  PagoData,
  CrearPagoInput,
  CrearPagoAuditInput,
  CrearPagosManualBatchInput,
  CrearPagosManualBatchResult,
  CrearPagosMercadoPagoBatchInput,
  CrearPagosMercadoPagoBatchResult,
  CorteData,
  MetricasAdmin,
} from '@/src/application/ports/pago.repository';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';
import {
  MercadoPagoPaymentIntentConflictError,
  type MercadoPagoPaymentIntentConflictReason,
} from '@/src/application/pagos/errors/mercado-pago-payment-intent-conflict.error';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import { pushNotificationValues } from '@/src/infrastructure/db/push-notification-outbox';
import {
  construirEstadoPagosTesorera,
  MAX_MESES_POR_PAGO_TESORERA,
  periodoDesdeFecha,
  periodoInicioCapturaTesorera,
} from '@/src/domain/pagos/periodos-tesoreria';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { TRPCError } from '@trpc/server';

function esViolacionUnicidad(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const databaseError = current as { code?: string; cause?: unknown };
    if (databaseError.code === '23505') return true;
    current = databaseError.cause;
  }
  return false;
}

function periodoKey(periodo: { mes: number; anio: number }): string {
  return `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
}

function moneyToCents(value: string): number | null {
  const match = /^(\d{1,8})\.(\d{2})$/.exec(value);
  if (!match) return null;

  const cents = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(cents) ? cents : null;
}

function storedPeriodSignature(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const period = value as Record<string, unknown>;
  if (
    typeof period.mes !== 'number' ||
    !Number.isInteger(period.mes) || period.mes < 1 || period.mes > 12 ||
    typeof period.anio !== 'number' ||
    !Number.isInteger(period.anio) || period.anio < 2020 || period.anio > 2100 ||
    typeof period.monto !== 'string' ||
    typeof period.esReconexion !== 'boolean'
  ) {
    return null;
  }

  const amount = moneyToCents(period.monto);
  if (amount === null || amount <= 0) return null;
  return `${period.anio}-${String(period.mes).padStart(2, '0')}:${amount}:${period.esReconexion ? 1 : 0}`;
}

function requestedPeriodSignature(
  value: CrearPagosMercadoPagoBatchInput['pagos'][number],
): string | null {
  const amount = moneyToCents(value.montoBase);
  if (amount === null || amount <= 0) return null;
  return `${value.anio}-${String(value.mes).padStart(2, '0')}:${amount}:${value.esReconexion ? 1 : 0}`;
}

function assertPaymentIntentMatches(
  intent: typeof mercadoPagoPaymentIntents.$inferSelect,
  input: CrearPagosMercadoPagoBatchInput,
) {
  const conflict = (reason: MercadoPagoPaymentIntentConflictReason): never => {
    throw new MercadoPagoPaymentIntentConflictError(
      input.paymentIntentReference!,
      input.mercadoPagoPaymentId,
      reason,
    );
  };

  if (intent.perfilId !== input.perfilId) conflict('profile_mismatch');
  if (intent.circuitoId !== input.circuitoId) conflict('circuit_mismatch');
  if (intent.currency !== 'MXN') conflict('currency_mismatch');
  if (
    intent.mercadoPagoPaymentId &&
    intent.mercadoPagoPaymentId !== input.mercadoPagoPaymentId
  ) {
    conflict('already_consumed');
  }
  if (Boolean(intent.mercadoPagoPaymentId) !== Boolean(intent.consumedAt)) {
    conflict('already_consumed');
  }

  if (!Array.isArray(intent.periodos) || intent.periodos.length !== input.pagos.length) {
    conflict('periods_mismatch');
  }
  const storedPeriods = intent.periodos.map(storedPeriodSignature);
  const requestedPeriods = input.pagos.map(requestedPeriodSignature);
  if (
    storedPeriods.some(period => period === null) ||
    requestedPeriods.some(period => period === null) ||
    [...storedPeriods].sort().join('|') !== [...requestedPeriods].sort().join('|')
  ) {
    conflict('periods_mismatch');
  }

  const expectedTotal = moneyToCents(intent.total);
  const requestedAmounts = input.pagos.map(pago => moneyToCents(pago.monto));
  const requestedTotal = requestedAmounts.reduce<number>(
    (sum, amount) => sum + (amount ?? 0),
    0,
  );
  if (
    expectedTotal === null ||
    requestedAmounts.some(amount => amount === null) ||
    requestedTotal !== expectedTotal
  ) {
    conflict('total_mismatch');
  }

  if (
    intent.collectorId &&
    input.pagos.some(pago => pago.mercadoPagoCollectorId !== intent.collectorId)
  ) {
    conflict('collector_mismatch');
  }
}

function corteDedupeKeys(perfilId: string, periodos: Array<{ mes: number; anio: number }>): string[] {
  return periodos.map(periodo => `corte_proximo:${perfilId}:${periodoKey(periodo)}`);
}

function cancelCutoffNotificationsQuery(
  perfilId: string,
  periodos: Array<{ mes: number; anio: number }>,
) {
  const keys = corteDedupeKeys(perfilId, periodos);
  return sql`
    WITH canceladas AS (
      UPDATE notificaciones
      SET
        estado = 'fallida',
        error = 'Cancelada automaticamente: el periodo ya fue pagado'
      WHERE perfil_id = ${perfilId}
        AND canal = 'push'
        AND tipo = 'corte_proximo'
        AND estado = 'pendiente'
        AND dedupe_key IN (${sql.join(keys.map(key => sql`${key}`), sql`, `)})
      RETURNING id
    )
    UPDATE push_deliveries
    SET
      estado = 'fallida',
      locked_at = NULL,
      last_error = 'payment_completed',
      updated_at = now()
    WHERE notification_id IN (SELECT id FROM canceladas)
      AND estado = 'pendiente'
  `;
}

export class DrizzlePagoRepository implements PagoRepository {
  async findByPerfilYMes(perfilId: string, mes: number, anio: number): Promise<PagoData | null> {
    const row = await db.query.pagos.findFirst({
      where: (p, { eq, and }) => and(eq(p.perfilId, perfilId), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
    });
    return row as PagoData | null;
  }

  async findByPerfilId(perfilId: string, limit = 12): Promise<PagoData[]> {
    const rows = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfilId),
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      limit,
    });
    return rows as PagoData[];
  }

  async findAllPagadosPorMes(mes: number, anio: number): Promise<PagoData[]> {
    const rows = await db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      orderBy: (p, { desc }) => [desc(p.fechaPago)],
    });
    return rows as PagoData[];
  }

  async findPagadosByMes(mes: number, anio: number): Promise<Array<{ perfilId: string }>> {
    return db.select({ perfilId: pagos.perfilId })
      .from(pagos)
      .where(and(eq(pagos.mes, mes), eq(pagos.anio, anio), eq(pagos.estado, 'pagado')));
  }

  async createWithLock(
    perfilId: string,
    input: CrearPagoInput,
    pushNotification?: PushNotificationInput,
    audit?: CrearPagoAuditInput,
  ): Promise<PagoData> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${perfilId} FOR UPDATE`);

        const yaPago = await tx.query.pagos.findFirst({
          where: (p, { eq, and }) =>
            and(eq(p.perfilId, perfilId), eq(p.mes, input.mes), eq(p.anio, input.anio), eq(p.estado, 'pagado')),
        });
        if (yaPago) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya existe un pago registrado para este mes' });
        }

        const perfil = await tx.query.perfilesResidente.findFirst({
          where: (p, { eq }) => eq(p.id, perfilId),
        });
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });

        const requiereReconexion = perfil.estadoAgua === 'cortado';
        if (requiereReconexion !== input.esReconexion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'El estado del servicio cambio; vuelve a calcular el pago antes de registrarlo',
          });
        }

        const [pago] = await tx.insert(pagos).values(input).returning();

        // Actualizar estado del perfil según tipo de pago
        if (perfil?.estadoAgua === 'pendiente_corte' && !input.esReconexion) {
          await tx.update(perfilesResidente).set({ estadoAgua: 'activo' }).where(eq(perfilesResidente.id, perfilId));
        } else if (perfil?.estadoAgua === 'cortado' && input.esReconexion) {
          // Transición a pendiente_reconexion: el pago cubre mes + reconexión.
          // El corte físico permanece abierto hasta que la cuadrilla confirme la reconexión.
          await tx.update(perfilesResidente).set({ estadoAgua: 'pendiente_reconexion' }).where(eq(perfilesResidente.id, perfilId));
        }

        await tx.insert(tickets).values({ pagoId: pago.id, folio: input.folio, pdfUrl: null });

        await tx.execute(cancelCutoffNotificationsQuery(perfilId, [input]));

        if (pushNotification) {
          await tx
            .insert(notificaciones)
            .values(pushNotificationValues(pushNotification))
            .onConflictDoNothing();
        }

        if (audit) {
          await tx.insert(auditoria).values({
            actorId: audit.actorId,
            accion: audit.accion,
            entidad: 'pago',
            entidadId: pago.id,
            detalle: {
              perfilId,
              metodo: audit.metodo,
              folio: pago.folio,
            },
          });
        }

        return pago;
      });
      return result as PagoData;
    } catch (txError) {
      if (txError instanceof TRPCError) throw txError;
      if (esViolacionUnicidad(txError)) {
        const ganador = await db.query.pagos.findFirst({
          where: (p, { eq, and }) =>
            and(eq(p.perfilId, perfilId), eq(p.mes, input.mes), eq(p.anio, input.anio), eq(p.estado, 'pagado')),
        });
        if (ganador) return ganador as PagoData;
      }
      throw txError;
    }
  }

  async createManualBatchWithLock(
    input: CrearPagosManualBatchInput,
  ): Promise<CrearPagosManualBatchResult> {
    const maximoPeriodos = input.politica.tipo === 'tesorera_escalonada'
      ? MAX_MESES_POR_PAGO_TESORERA
      : 36;
    if (input.pagos.length < 1 || input.pagos.length > maximoPeriodos) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `El lote debe contener entre 1 y ${maximoPeriodos} periodos`,
      });
    }

    const requestedKeys = new Set<string>();
    for (const pago of input.pagos) {
      if (pago.perfilId !== input.perfilId || pago.metodo === 'mercado_pago') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El lote manual contiene datos incompatibles' });
      }
      const key = periodoKey(pago);
      if (requestedKeys.has(key)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Periodo duplicado en el lote: ${key}` });
      }
      requestedKeys.add(key);
    }

    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${input.perfilId} FOR UPDATE`);

        const perfil = await tx.query.perfilesResidente.findFirst({
          where: (p, { eq }) => eq(p.id, input.perfilId),
        });
        if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });

        const existentes = await tx.query.pagos.findMany({
          where: (p, { eq, and }) => and(eq(p.perfilId, input.perfilId), eq(p.estado, 'pagado')),
        });
        const existentesPorPeriodo = new Map(
          existentes
            .filter(pago => requestedKeys.has(periodoKey(pago)))
            .map(pago => [periodoKey(pago), pago] as const),
        );

        if (input.politica.tipo === 'tesorera_escalonada') {
          if (input.pagos.some(pago => pago.circuitoId !== perfil.circuitoId)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'El residente cambio de circuito; actualiza la lista antes de registrar el pago',
            });
          }

          if (existentesPorPeriodo.size > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Uno o mas periodos seleccionados ya fueron pagados; actualiza la lista e intenta de nuevo',
            });
          }

          const vigente = PeriodoVO.vigente();
          const periodoActual = { mes: vigente.mes, anio: vigente.anio };
          const estadoPagos = construirEstadoPagosTesorera({
            periodoActual,
            periodoInicio: periodoInicioCapturaTesorera(perfil.creadoEn, periodoActual),
            periodoInicioAdeudo: periodoDesdeFecha(perfil.creadoEn, periodoActual),
            periodosPagados: existentes,
          });
          const periodosDisponibles = new Set(
            estadoPagos.periodos
              .filter(periodo => periodo.estado === 'disponible')
              .map(periodoKey),
          );
          const periodosInvalidos = input.pagos
            .filter(pago => !periodosDisponibles.has(periodoKey(pago)))
            .map(({ mes, anio }) => periodoKey({ mes, anio }));

          if (periodosInvalidos.length > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Los periodos seleccionados no corresponden a la accion disponible: ${periodosInvalidos.join(', ')}`,
            });
          }
        }

        const faltantes = input.pagos.filter(pago => !existentesPorPeriodo.has(periodoKey(pago)));
        const omitidos = input.pagos
          .filter(pago => existentesPorPeriodo.has(periodoKey(pago)))
          .map(({ mes, anio }) => ({ mes, anio }));

        if (input.actualizarEstadoAgua && faltantes.length > 0) {
          const incluyeReconexion = faltantes.some(pago => pago.esReconexion);
          const requiereReconexion = perfil.estadoAgua === 'cortado';
          if (incluyeReconexion !== requiereReconexion) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'El estado del servicio cambio; vuelve a calcular el lote antes de registrarlo',
            });
          }
        }

        let insertados: typeof existentes = [];
        if (faltantes.length > 0) {
          insertados = await tx.insert(pagos).values(faltantes).returning();
          await tx.insert(tickets).values(insertados.map(pago => ({
            pagoId: pago.id,
            folio: pago.folio!,
            pdfUrl: null,
          })));

          if (input.actualizarEstadoAgua) {
            const incluyeReconexion = faltantes.some(pago => pago.esReconexion);
            if (perfil.estadoAgua === 'pendiente_corte' && !incluyeReconexion) {
              await tx.update(perfilesResidente)
                .set({ estadoAgua: 'activo' })
                .where(eq(perfilesResidente.id, input.perfilId));
            } else if (perfil.estadoAgua === 'cortado' && incluyeReconexion) {
              await tx.update(perfilesResidente)
                .set({ estadoAgua: 'pendiente_reconexion' })
                .where(eq(perfilesResidente.id, input.perfilId));
            }
          }

          await tx.execute(cancelCutoffNotificationsQuery(input.perfilId, faltantes));
          await tx.insert(notificaciones)
            .values(pushNotificationValues(input.pushNotification))
            .onConflictDoNothing();
        }

        await tx.insert(auditoria).values({
          actorId: input.auditoria.actorId,
          accion: input.auditoria.accion,
          entidad: 'pago',
          entidadId: insertados[0]?.id ?? input.perfilId,
          detalle: {
            perfilId: input.perfilId,
            metodo: input.auditoria.metodo,
            folios: insertados.map(pago => pago.folio),
            omitidos,
            periodos: input.pagos.map(({ mes, anio }) => ({ mes, anio })),
          },
        });

        return { pagos: insertados as PagoData[], omitidos };
      });
    } catch (txError) {
      if (txError instanceof TRPCError) throw txError;
      if (esViolacionUnicidad(txError)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Uno o mas periodos fueron registrados por otra solicitud; actualiza la lista e intenta de nuevo',
        });
      }
      throw txError;
    }
  }

  async createMercadoPagoBatchWithLock(
    input: CrearPagosMercadoPagoBatchInput,
  ): Promise<CrearPagosMercadoPagoBatchResult> {
    if (input.pagos.length < 1 || input.pagos.length > 12) {
      throw new Error('Un pago de Mercado Pago debe contener entre 1 y 12 periodos');
    }
    if (!input.mercadoPagoPaymentId.trim()) {
      throw new Error('El paymentId de Mercado Pago es obligatorio');
    }

    const requestedKeys = new Set<string>();
    for (const pago of input.pagos) {
      if (
        pago.perfilId !== input.perfilId ||
        pago.circuitoId !== input.circuitoId ||
        pago.mercadoPagoPaymentId !== input.mercadoPagoPaymentId
      ) {
        throw new Error('Todos los periodos deben pertenecer al mismo perfil, circuito y paymentId');
      }
      const key = periodoKey(pago);
      if (requestedKeys.has(key)) throw new Error(`Periodo duplicado en el lote: ${key}`);
      requestedKeys.add(key);
    }

    const runTransaction = () => db.transaction(async (tx) => {
      // El advisory lock impide acreditar el mismo paymentId a dos perfiles
      // distintos; la fila del perfil serializa despues todos sus periodos.
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${input.mercadoPagoPaymentId}, 0))
      `);

      let paymentIntent: typeof mercadoPagoPaymentIntents.$inferSelect | null = null;
      if (input.paymentIntentReference !== undefined) {
        // La fila de la intencion serializa dos paymentIds distintos que
        // intenten consumir la misma referencia al mismo tiempo.
        await tx.execute(sql`
          SELECT external_reference
          FROM mercado_pago_payment_intents
          WHERE external_reference = ${input.paymentIntentReference}
          FOR UPDATE
        `);
        paymentIntent = await tx.query.mercadoPagoPaymentIntents.findFirst({
          where: (intent, { eq }) =>
            eq(intent.externalReference, input.paymentIntentReference!),
        }) ?? null;
        if (!paymentIntent) {
          throw new MercadoPagoPaymentIntentConflictError(
            input.paymentIntentReference,
            input.mercadoPagoPaymentId,
            'not_found',
          );
        }
        assertPaymentIntentMatches(paymentIntent, input);

        // El advisory lock del paymentId vuelve estable esta consulta. Evita
        // depender de una violacion del indice unico para clasificar el caso.
        const intentForSamePayment = await tx.query.mercadoPagoPaymentIntents.findFirst({
          where: (intent, { eq }) =>
            eq(intent.mercadoPagoPaymentId, input.mercadoPagoPaymentId),
        });
        if (
          intentForSamePayment &&
          intentForSamePayment.externalReference !== input.paymentIntentReference
        ) {
          throw new MercadoPagoPaymentIntentConflictError(
            input.paymentIntentReference,
            input.mercadoPagoPaymentId,
            'already_consumed',
          );
        }
      }
      await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${input.perfilId} FOR UPDATE`);

      const perfil = await tx.query.perfilesResidente.findFirst({
        where: (p, { eq }) => eq(p.id, input.perfilId),
      });
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });
      if (perfil.circuitoId !== input.circuitoId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'El perfil cambio de circuito durante la confirmacion del pago',
        });
      }

      const existentesRelevantes = await tx.query.pagos.findMany({
        // La identidad externa es inmutable aunque el estado contable cambie.
        // Un pago reversado no debe desaparecer de la deteccion de replay.
        where: (p, { eq, and, or }) => or(
          eq(p.mercadoPagoPaymentId, input.mercadoPagoPaymentId),
          and(eq(p.perfilId, input.perfilId), eq(p.estado, 'pagado')),
        ),
      });
      const existentesMismoPago = existentesRelevantes.filter(pago =>
        pago.mercadoPagoPaymentId === input.mercadoPagoPaymentId);
      const existentesPerfilPagados = existentesRelevantes.filter(pago =>
        pago.perfilId === input.perfilId && pago.estado === 'pagado');
      const reutilizadoEnOtroPerfil = existentesRelevantes.filter(pago =>
        pago.mercadoPagoPaymentId === input.mercadoPagoPaymentId &&
        pago.perfilId !== input.perfilId);

      if (reutilizadoEnOtroPerfil.length > 0) {
        throw new MercadoPagoPeriodConflictError(
          input.mercadoPagoPaymentId,
          reutilizadoEnOtroPerfil.map(pago => ({
            mes: pago.mes,
            anio: pago.anio,
            existingPaymentId: pago.mercadoPagoPaymentId,
            existingPerfilId: pago.perfilId,
          })),
        );
      }

      const existentesPorPeriodo = new Map(
        [...existentesMismoPago, ...existentesPerfilPagados]
          .filter(pago => requestedKeys.has(periodoKey(pago)))
          .map(pago => [periodoKey(pago), pago] as const),
      );
      const conflictos = existentesPerfilPagados
        .filter(pago => requestedKeys.has(periodoKey(pago)))
        .filter(pago => pago.mercadoPagoPaymentId !== input.mercadoPagoPaymentId)
        .map(pago => ({
          mes: pago.mes,
          anio: pago.anio,
          existingPaymentId: pago.mercadoPagoPaymentId,
        }));

      // Un paymentId no puede reaparecer con una referencia que describa otros
      // periodos. Se permite solamente completar lotes parciales creados por la
      // implementacion anterior (sus periodos son subconjunto del lote actual).
      const periodosAjenosDelMismoPago = existentesMismoPago
        .filter(pago => !requestedKeys.has(periodoKey(pago)))
        .map(pago => ({
          mes: pago.mes,
          anio: pago.anio,
          existingPaymentId: pago.mercadoPagoPaymentId,
        }));

      if (conflictos.length > 0 || periodosAjenosDelMismoPago.length > 0) {
        throw new MercadoPagoPeriodConflictError(
          input.mercadoPagoPaymentId,
          [...conflictos, ...periodosAjenosDelMismoPago],
        );
      }

      const faltantes = input.pagos.filter(pago => !existentesPorPeriodo.has(periodoKey(pago)));
      let insertados: typeof existentesPerfilPagados = [];
      if (faltantes.length > 0) {
        insertados = await tx.insert(pagos).values(faltantes).returning();
        const incluyeReconexion = input.pagos.some(pago => pago.esReconexion);
        if (perfil.estadoAgua === 'pendiente_corte' && !incluyeReconexion) {
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'activo' })
            .where(eq(perfilesResidente.id, input.perfilId));
        } else if (perfil.estadoAgua === 'cortado' && incluyeReconexion) {
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'pendiente_reconexion' })
            .where(eq(perfilesResidente.id, input.perfilId));
        }

        await tx.insert(tickets).values(insertados.map((pago) => ({
          pagoId: pago.id,
          folio: pago.folio!,
          pdfUrl: null,
        })));
      }

      // Un cobro genera un solo mensaje, incluso si acredita doce periodos. El
      // insert queda al final para que nunca se publique antes del lote completo.
      if (faltantes.length > 0) {
        await tx.execute(cancelCutoffNotificationsQuery(input.perfilId, faltantes));
        await tx
          .insert(notificaciones)
          .values(pushNotificationValues(input.pushNotification))
          .onConflictDoNothing();
      }

      if (paymentIntent) {
        // Esta escritura comparte commit/rollback con pagos, tickets, estado de
        // agua y outbox. Tambien repara de forma idempotente una intencion cuyo
        // paymentId ya tenia pagos historicos pero aun no estaba marcada.
        await tx
          .update(mercadoPagoPaymentIntents)
          .set({
            mercadoPagoPaymentId: input.mercadoPagoPaymentId,
            consumedAt: paymentIntent.consumedAt ?? new Date(),
          })
          .where(eq(
            mercadoPagoPaymentIntents.externalReference,
            input.paymentIntentReference!,
          ));
      }

      const todosPorPeriodo = new Map(
        [...existentesPorPeriodo.values(), ...insertados]
          .map(pago => [periodoKey(pago), pago] as const),
      );

      return {
        pagos: input.pagos.map(pago => todosPorPeriodo.get(periodoKey(pago)) as PagoData),
        yaRegistrado: faltantes.length === 0,
      };
    });

    try {
      return await runTransaction();
    } catch (error) {
      if (error instanceof MercadoPagoPeriodConflictError) throw error;
      // Otro escritor que no usa el lock de perfil (por ejemplo, una operacion
      // administrativa antigua) aun puede ganar el indice unico. Tras el rollback
      // se reintenta una vez para clasificarlo como replay o conflicto explicito.
      if (esViolacionUnicidad(error)) return runTransaction();
      throw error;
    }
  }

  async findCorteActivo(perfilId: string): Promise<CorteData | null> {
    const row = await db.query.cortes.findFirst({
      where: (c, { eq, and }) => and(eq(c.perfilId, perfilId), eq(c.activo, true)),
    });
    return row as CorteData | null;
  }

  async crearCorte(data: { perfilId: string; trabajadorId: string; motivo: string }): Promise<CorteData> {
    const [row] = await db.insert(cortes).values({ ...data, activo: true }).returning();
    return row as CorteData;
  }

  async cerrarCorte(corteId: string, fecha: Date, reconectadoPor?: string): Promise<void> {
    await db.update(cortes)
      .set({ activo: false, fechaReconexion: fecha, reconectadoPor })
      .where(eq(cortes.id, corteId));
  }

  async crearTicket(pagoId: string, folio: string): Promise<void> {
    await db.insert(tickets).values({ pagoId, folio, pdfUrl: null });
  }

  async marcarPendientesVencidos(antes: Date): Promise<number> {
    const result = await db
      .update(pagos)
      .set({ estado: 'vencido' })
      .where(and(eq(pagos.estado, 'pendiente'), lt(pagos.creadoEn, antes)));
    return result.rowCount ?? 0;
  }

  async getMetricasAdmin(mes: number, anio: number): Promise<MetricasAdmin> {
    // Pagos por día — last 30 days, regardless of month filter
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 29);
    hace30.setHours(0, 0, 0, 0);

    const porDiaRows = await db
      .select({
        fecha: sql<string>`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`,
        cantidad: sql<number>`count(*)::int`,
        monto: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
      })
      .from(pagos)
      .where(and(eq(pagos.estado, 'pagado'), gte(pagos.fechaPago, hace30)))
      .groupBy(sql`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`);

    // Revenue and counts for the given month
    const [mesRow] = await db
      .select({
        revenue: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
        pagados: sql<number>`count(*)::int`,
        reconexiones: sql<number>`count(*) filter (where ${pagos.esReconexion} = true)::int`,
      })
      .from(pagos)
      .where(and(eq(pagos.estado, 'pagado'), eq(pagos.mes, mes), eq(pagos.anio, anio)));

    const [totalRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(perfilesResidente);

    const porCircuitoRows = await db
      .select({
        circuitoId: circuitos.id,
        nombre: circuitos.nombre,
        cuota: sql<number>`${circuitos.montoMensual}::numeric`,
        totalResidentes: sql<number>`count(distinct ${perfilesResidente.id})::int`,
        residentesAlCorriente: sql<number>`count(distinct ${pagos.perfilId}) filter (where ${pagos.id} is not null)::int`,
        pagosRecibidos: sql<number>`count(${pagos.id})::int`,
        totalRecaudado: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
        comisionesOnline: sql<number>`coalesce(sum((${pagos.comisionMercadoPago}::numeric + ${pagos.retencionIsr}::numeric + ${pagos.retencionIva}::numeric)) filter (where ${pagos.metodo} = 'mercado_pago'), 0)::float`,
      })
      .from(circuitos)
      .leftJoin(perfilesResidente, eq(perfilesResidente.circuitoId, circuitos.id))
      .leftJoin(
        pagos,
        and(
          eq(pagos.perfilId, perfilesResidente.id),
          eq(pagos.estado, 'pagado'),
          eq(pagos.mes, mes),
          eq(pagos.anio, anio),
        ),
      )
      .groupBy(circuitos.id, circuitos.nombre, circuitos.montoMensual)
      .orderBy(circuitos.nombre);

    const totalResidentes = totalRow?.total ?? 0;
    const totalPagadosMes = mesRow?.pagados ?? 0;
    const morosidadPct = totalResidentes > 0
      ? Math.round(((totalResidentes - totalPagadosMes) / totalResidentes) * 100)
      : 0;

    return {
      pagosPorDia:    porDiaRows.map(r => ({ fecha: r.fecha, cantidad: r.cantidad, monto: r.monto })),
      revenueMes:     mesRow?.revenue ?? 0,
      totalPagadosMes,
      totalResidentes,
      morosidadPct,
      reconexionesMes: mesRow?.reconexiones ?? 0,
      porCircuito: porCircuitoRows.map((row) => {
        const residentesConAdeudos = Math.max((row.totalResidentes ?? 0) - (row.residentesAlCorriente ?? 0), 0);
        return {
          circuitoId: row.circuitoId,
          nombre: row.nombre,
          totalRecaudado: row.totalRecaudado ?? 0,
          pagosRecibidos: row.pagosRecibidos ?? 0,
          residentesAlCorriente: row.residentesAlCorriente ?? 0,
          residentesConAdeudos,
          montoPendientePorCobrar: residentesConAdeudos * Number(row.cuota ?? 0),
          comisionesOnline: row.comisionesOnline ?? 0,
        };
      }),
    };
  }
}
