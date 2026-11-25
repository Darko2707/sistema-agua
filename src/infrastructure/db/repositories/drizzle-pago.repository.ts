import { and, desc, eq, gte, inArray, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import {
  auditoria,
  pagos,
  cortes,
  tickets,
  perfilesResidente,
  fraccionamientos,
  notificaciones,
  mercadoPagoPaymentIntents,
  comprobantesTransferencia,
  cargosServicios,
  fraccionamientoServicios,
  servicios,
  user,
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
  ComprobanteEnriquecido,
  FraccionamientoParaCobro,
  FraccionamientoParaCobroRepresentante,
  MetodoPagoMercadoPago,
  FolioRow,
  ComprobantePendienteRow,
  ComprobanteConResidente,
  ComprobanteConResidenteCompleto,
  ResidentesParaPagoTesorera,
  RechazarComprobanteInput,
  RegistrarCargosObligatoriosManualesInput,
  CrearComprobanteTransferenciaInput,
} from '@/src/application/ports/pago.repository';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';
import {
  MercadoPagoPaymentIntentConflictError,
  type MercadoPagoPaymentIntentConflictReason,
} from '@/src/application/pagos/errors/mercado-pago-payment-intent-conflict.error';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import { calcularDesglosePago } from '@/src/domain/pagos/calculator';
import { pushNotificationValues } from '@/src/infrastructure/db/push-notification-outbox';
import {
  construirEstadoPagosTesorera,
  MAX_MESES_POR_PAGO_TESORERA,
  periodoDesdeFecha,
  periodoInicioCapturaTesorera,
} from '@/src/domain/pagos/periodos-tesoreria';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { generarFolioServicio } from '@/src/domain/pagos/folio.vo';
import { TRPCError } from '@trpc/server';

type PagoTransactionExecutor = {
  execute(query: SQL): Promise<unknown>;
};

/**
 * El pago de reconexión solo cambia el estado a pendiente_reconexion. La
 * reconexión física sigue siendo trabajo de una cuadrilla, por lo que se crea
 * una orden independiente dentro de la misma transacción del pago.
 */
async function enqueueReconnectionOrder(
  tx: PagoTransactionExecutor,
  perfilId: string,
  idempotencyKey: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ordenes_trabajo (
      fraccionamiento_id,
      perfil_id,
      fraccionamiento_servicio_id,
      tipo,
      estado,
      motivo,
      idempotency_key
    )
    SELECT
      perfil.fraccionamiento_id,
      perfil.id,
      perfil_servicio.fraccionamiento_servicio_id,
      'reconexion',
      'pendiente',
      'pago_reconexion',
      ${idempotencyKey}
    FROM perfiles_residente AS perfil
    INNER JOIN perfiles_servicios AS perfil_servicio
      ON perfil_servicio.perfil_id = perfil.id
     AND perfil_servicio.fraccionamiento_id = perfil.fraccionamiento_id
     AND perfil_servicio.activo = true
    INNER JOIN fraccionamiento_servicios AS activacion
      ON activacion.id = perfil_servicio.fraccionamiento_servicio_id
     AND activacion.fraccionamiento_id = perfil.fraccionamiento_id
     AND activacion.estado = 'activo'
    INNER JOIN servicios AS servicio
      ON servicio.id = activacion.servicio_id
     AND servicio.clave = 'agua'
     AND servicio.con_corte_fisico = true
    WHERE perfil.id = ${perfilId}
      AND perfil.estado_agua = 'pendiente_reconexion'
    ON CONFLICT DO NOTHING
  `);
}

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
  if (input.fraccionamientoId && intent.fraccionamientoId !== input.fraccionamientoId) conflict('fraccionamiento_mismatch');
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

  // Una intención mixta guarda el total cobrado de agua + servicios. Este
  // repositorio inserta únicamente los renglones de agua; el webhook valida el
  // total completo antes de llegar aquí y acredita los servicios por separado.
  const expectedTotal = intent.tipo === 'mixto'
    ? moneyToCents(calcularDesglosePago(
        input.pagos.reduce((sum, pago) => sum + Number(pago.montoBase), 0),
      ).total)
    : moneyToCents(intent.total);
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

/** Reconciliación del ledger histórico con el cargo genérico de agua. */
function reconcileWaterServiceCargoQuery(pago: {
  perfilId: string;
  mes: number;
  anio: number;
  monto: string;
  metodo: string;
  mercadoPagoPaymentId?: string | null;
  folio: string;
  fechaPago: Date;
}) {
  return sql`
    UPDATE cargos_servicios c
    SET estado = 'pagado',
        metodo = ${pago.metodo}::metodo_pago,
        mercado_pago_payment_id = ${pago.mercadoPagoPaymentId ?? null},
        folio = ${pago.folio},
        pagado_en = ${pago.fechaPago}
    FROM fraccionamiento_servicios fs
    JOIN servicios s ON s.id = fs.servicio_id
    WHERE c.fraccionamiento_servicio_id = fs.id
      AND s.clave = 'agua'
      AND c.perfil_id = ${pago.perfilId}
      AND c.mes = ${pago.mes}
      AND c.anio = ${pago.anio}
      AND c.estado = 'pendiente'
      AND c.monto = ${pago.monto}
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

        const [pago] = await tx.insert(pagos).values({
          ...input,
          fraccionamientoId: perfil.fraccionamientoId!,
        }).returning();
        await tx.execute(reconcileWaterServiceCargoQuery({
          perfilId: pago.perfilId,
          mes: pago.mes,
          anio: pago.anio,
          monto: pago.monto,
          metodo: pago.metodo!,
          mercadoPagoPaymentId: pago.mercadoPagoPaymentId,
          folio: pago.folio!,
          fechaPago: pago.fechaPago!,
        }));

        // Actualizar estado del perfil según tipo de pago
        if (perfil?.estadoAgua === 'pendiente_corte' && !input.esReconexion) {
          await tx.update(perfilesResidente).set({ estadoAgua: 'activo' }).where(eq(perfilesResidente.id, perfilId));
        } else if (perfil?.estadoAgua === 'cortado' && input.esReconexion) {
          // Transición a pendiente_reconexion: el pago cubre mes + reconexión.
          // El corte físico permanece abierto hasta que la cuadrilla confirme la reconexión.
          await tx.update(perfilesResidente).set({ estadoAgua: 'pendiente_reconexion' }).where(eq(perfilesResidente.id, perfilId));
          await enqueueReconnectionOrder(tx, perfilId, `reconexion:pago:${pago.id}`);
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
    const transferenciaSoloServicios = Boolean(input.aprobarComprobante?.cargoServicioIds?.length) && input.pagos.length === 0;
    if ((!transferenciaSoloServicios && input.pagos.length < 1) || input.pagos.length > maximoPeriodos) {
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

        const transferApproval = input.aprobarComprobante;
        const cargoServicioIds = [...new Set(transferApproval?.cargoServicioIds ?? [])];
        if (transferApproval && cargoServicioIds.length > 0) {
          const cargos = await tx.select({
            id: cargosServicios.id,
            monto: cargosServicios.monto,
            estado: cargosServicios.estado,
            servicioNombre: servicios.nombre,
            servicioClave: servicios.clave,
          }).from(cargosServicios)
            .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
            .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
            .where(and(
              eq(cargosServicios.perfilId, input.perfilId),
              eq(cargosServicios.fraccionamientoId, perfil.fraccionamientoId!),
              inArray(cargosServicios.id, cargoServicioIds),
              ne(servicios.clave, 'agua'),
            ));
          if (cargos.length !== cargoServicioIds.length || cargos.some(cargo => cargo.estado !== 'pendiente')) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Uno o más cargos ya fueron pagados, cancelados o no pertenecen al residente.' });
          }
          const cargoMonto = cargos.reduce((sum, cargo) => sum + Number(cargo.monto), 0);
          const comprobante = await tx.query.comprobantesTransferencia.findFirst({
            where: (row, { eq }) => eq(row.id, transferApproval.comprobanteId),
            columns: { monto: true },
          });
          const aguaMonto = input.pagos.reduce((sum, pago) => sum + Number(pago.monto), 0);
          if (comprobante && Math.abs(Number(comprobante.monto) - aguaMonto - cargoMonto) > 0.01) {
            throw new TRPCError({ code: 'CONFLICT', message: 'El importe del comprobante no coincide con los periodos y cargos seleccionados.' });
          }
          for (const cargo of cargos) {
            const folio = generarFolioServicio();
            const [updated] = await tx.update(cargosServicios).set({
              estado: 'pagado', metodo: 'transferencia', folio, pagadoEn: new Date(),
            }).where(and(eq(cargosServicios.id, cargo.id), eq(cargosServicios.estado, 'pendiente')))
              .returning({ id: cargosServicios.id });
            if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'Un cargo cambió de estado durante la aprobación.' });
            await tx.insert(tickets).values({ pagoId: null, cargoServicioId: cargo.id, tipo: 'servicio', folio, pdfUrl: null });
            await tx.insert(auditoria).values({
              actorId: transferApproval.revisadoPor,
              accion: 'servicio.cargo.pagado_transferencia',
              entidad: 'cargos_servicios',
              entidadId: cargo.id,
              detalle: { perfilId: input.perfilId, fraccionamientoId: perfil.fraccionamientoId, metodo: 'transferencia', folio, comprobanteId: transferApproval.comprobanteId, servicio: cargo.servicioNombre },
            });
          }
          const [receipt] = await tx.select({ metadatos: comprobantesTransferencia.metadatos })
            .from(comprobantesTransferencia)
            .where(eq(comprobantesTransferencia.id, transferApproval.comprobanteId)).limit(1);
          if (receipt) await tx.update(comprobantesTransferencia).set({
            metadatos: { ...(receipt.metadatos ?? {}), cargosAcreditadosIds: cargoServicioIds }, actualizadoEn: new Date(),
          }).where(eq(comprobantesTransferencia.id, transferApproval.comprobanteId));
        } else if (transferApproval) {
          const comprobante = await tx.query.comprobantesTransferencia.findFirst({
            where: (row, { eq }) => eq(row.id, transferApproval.comprobanteId),
            columns: { monto: true },
          });
          const aguaMonto = input.pagos.reduce((sum, pago) => sum + Number(pago.monto), 0);
          if (comprobante && Math.abs(Number(comprobante.monto) - aguaMonto) > 0.01) {
            throw new TRPCError({ code: 'CONFLICT', message: 'El importe del comprobante no coincide con los periodos seleccionados.' });
          }
        }

        if (input.politica.tipo === 'tesorera_escalonada') {
          if (input.pagos.some(pago => pago.fraccionamientoId !== perfil.fraccionamientoId)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'El residente cambio de fraccionamiento; actualiza la lista antes de registrar el pago',
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
          insertados = await tx.insert(pagos).values(faltantes.map((pago) => ({
            ...pago,
            fraccionamientoId: perfil.fraccionamientoId!,
          }))).returning();
          for (const pago of insertados) {
            await tx.execute(reconcileWaterServiceCargoQuery({
              perfilId: pago.perfilId,
              mes: pago.mes,
              anio: pago.anio,
              monto: pago.monto,
              metodo: pago.metodo!,
              mercadoPagoPaymentId: pago.mercadoPagoPaymentId,
              folio: pago.folio!,
              fechaPago: pago.fechaPago!,
            }));
          }
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
              await enqueueReconnectionOrder(tx, input.perfilId, `reconexion:lote:${insertados[0]?.id ?? input.perfilId}`);
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

        if (input.aprobarComprobante) {
          const revisadoEn = new Date();
          const [comprobanteActualizado] = await tx.update(comprobantesTransferencia).set({
            estado: 'aprobado',
            fechaRevision: revisadoEn,
            revisadoPor: input.aprobarComprobante.revisadoPor,
            pagoId: insertados[0]?.id ?? null,
            actualizadoEn: revisadoEn,
          }).where(and(
            eq(comprobantesTransferencia.id, input.aprobarComprobante.comprobanteId),
            eq(comprobantesTransferencia.fraccionamientoId, input.aprobarComprobante.fraccionamientoId),
            eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
          )).returning({ id: comprobantesTransferencia.id });

          if (!comprobanteActualizado) {
            throw new TRPCError({ code: 'CONFLICT', message: 'El comprobante ya fue revisado por otra solicitud' });
          }

          await tx.insert(auditoria).values({
            actorId: input.aprobarComprobante.revisadoPor,
            accion: 'comprobante_transferencia.aprobado',
            entidad: 'comprobantes_transferencia',
            entidadId: input.aprobarComprobante.comprobanteId,
            detalle: {
              perfilId: input.perfilId,
              pagoId: insertados[0]?.id ?? null,
              meses: input.aprobarComprobante.meses,
            },
          });
        }

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
        (input.fraccionamientoId && pago.fraccionamientoId !== input.fraccionamientoId) ||
        pago.mercadoPagoPaymentId !== input.mercadoPagoPaymentId
      ) {
        throw new Error('Todos los periodos deben pertenecer al mismo perfil, fraccionamiento y paymentId');
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
      if (input.fraccionamientoId && perfil.fraccionamientoId !== input.fraccionamientoId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'El perfil cambio de fraccionamiento durante la confirmacion del pago' });
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
        insertados = await tx.insert(pagos).values(faltantes.map((pago) => ({
          ...pago,
          fraccionamientoId: perfil.fraccionamientoId!,
        }))).returning();
        for (const pago of insertados) {
          await tx.execute(reconcileWaterServiceCargoQuery({
            perfilId: pago.perfilId,
            mes: pago.mes,
            anio: pago.anio,
            monto: pago.monto,
            metodo: pago.metodo!,
            mercadoPagoPaymentId: pago.mercadoPagoPaymentId,
            folio: pago.folio!,
            fechaPago: pago.fechaPago!,
          }));
        }
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
          await enqueueReconnectionOrder(tx, input.perfilId, `reconexion:mp:${insertados[0]?.id ?? input.mercadoPagoPaymentId}`);
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

    const porFraccionamientoRows = await db
      .select({
        fraccionamientoId: fraccionamientos.id,
        nombre: fraccionamientos.nombre,
        cuota: sql<number>`${fraccionamientos.montoMensual}::numeric`,
        totalResidentes: sql<number>`count(distinct ${perfilesResidente.id})::int`,
        residentesAlCorriente: sql<number>`count(distinct ${pagos.perfilId}) filter (where ${pagos.id} is not null)::int`,
        pagosRecibidos: sql<number>`count(${pagos.id})::int`,
        totalRecaudado: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
        comisionesOnline: sql<number>`coalesce(sum((${pagos.comisionMercadoPago}::numeric + ${pagos.retencionIsr}::numeric + ${pagos.retencionIva}::numeric)) filter (where ${pagos.metodo} = 'mercado_pago'), 0)::float`,
      })
      .from(fraccionamientos)
      .leftJoin(perfilesResidente, eq(perfilesResidente.fraccionamientoId, fraccionamientos.id))
      .leftJoin(
        pagos,
        and(
          eq(pagos.perfilId, perfilesResidente.id),
          eq(pagos.estado, 'pagado'),
          eq(pagos.mes, mes),
          eq(pagos.anio, anio),
        ),
      )
      .groupBy(fraccionamientos.id, fraccionamientos.nombre, fraccionamientos.montoMensual)
      .orderBy(fraccionamientos.nombre);

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
      porFraccionamiento: porFraccionamientoRows.map((row) => {
        const residentesConAdeudos = Math.max((row.totalResidentes ?? 0) - (row.residentesAlCorriente ?? 0), 0);
        return {
          fraccionamientoId: row.fraccionamientoId,
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

  // ── Métodos extraídos del router pagos.ts ───────────────────────────────────

  async enrichComprobantesByPagoIds(pagoIds: string[]): Promise<ComprobanteEnriquecido[]> {
    if (pagoIds.length === 0) return [];
    return db
      .select({
        id:             comprobantesTransferencia.id,
        pagoId:         comprobantesTransferencia.pagoId,
        monto:          comprobantesTransferencia.monto,
        concepto:       comprobantesTransferencia.concepto,
        comprobanteUrl: comprobantesTransferencia.comprobanteUrl,
        estado:         comprobantesTransferencia.estado,
      })
      .from(comprobantesTransferencia)
      .where(and(
        inArray(comprobantesTransferencia.pagoId, pagoIds),
        eq(comprobantesTransferencia.estado, 'aprobado'),
      ));
  }

  async findFraccionamientoForCobroRepresentante(
    fraccionamientoId: string,
    representanteId: string,
  ): Promise<FraccionamientoParaCobroRepresentante | null> {
    const row = await db.query.fraccionamientos.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.id, fraccionamientoId),
        eq(f.representanteId, representanteId),
        eq(f.activo, true),
      ),
      columns: { montoMensual: true, montoReconexion: true },
    });
    return row ?? null;
  }

  async findMetodoPagoMercadoPago(fraccionamientoId: string): Promise<MetodoPagoMercadoPago | null> {
    const row = await db.query.fraccionamientoMetodosPago.findFirst({
      where: (m, { and, eq }) => and(
        eq(m.fraccionamientoId, fraccionamientoId),
        eq(m.proveedor, 'mercado_pago'),
        eq(m.activo, true),
      ),
      columns: { collectorId: true },
    });
    return row ?? null;
  }

  async findFoliosByPerfilUserId(userId: string): Promise<FolioRow[]> {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });
    if (!perfil) throw new TRPCError({ code: 'NOT_FOUND', message: 'Perfil no encontrado' });

    const pagosList = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfil.id),
      with: {
        perfil: { with: { usuario: true, fraccionamiento: true } },
      },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
    });

    return pagosList.map((p) => ({
      id:           p.id,
      folio:        p.folio,
      mes:          p.mes,
      anio:         p.anio,
      monto:        p.monto,
      estado:       p.estado,
      esReconexion: p.esReconexion,
      fechaPago:    p.fechaPago,
      fraccionamiento: p.perfil?.fraccionamiento?.nombre || 'Sin fraccionamiento',
      residente:    p.perfil?.usuario?.name    || 'Sin nombre',
    }));
  }

  async findPagosForReporteRepresentante(fraccionamientoId: string): Promise<unknown[]> {
    return db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.fraccionamientoId, fraccionamientoId), eq(p.estado, 'pagado')),
      with: { perfil: true },
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes), desc(p.fechaPago)],
    });
  }

  async findPagosByFraccionamientoAndPeriodo(
    fraccionamientoId: string,
    mes: number,
    anio: number,
  ): Promise<unknown[]> {
    return db.query.pagos.findMany({
      where: (p, { eq, and }) =>
        and(eq(p.fraccionamientoId, fraccionamientoId), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      with: { perfil: { with: { usuario: true } } },
      orderBy: (p, { desc }) => [desc(p.fechaPago)],
    });
  }

  async findResidentesParaPagoTesorera(
    fraccionamientoId: string,
    tesoreraId: string,
  ): Promise<ResidentesParaPagoTesorera> {
    const fraccionamiento = await db.query.fraccionamientos.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.id, fraccionamientoId),
        eq(f.tesoreraId, tesoreraId),
        eq(f.activo, true),
      ),
      columns: { id: true, nombre: true, montoMensual: true, montoReconexion: true },
    });
    if (!fraccionamiento) {
      return { fraccionamiento: null, perfiles: [], cargosPendientes: [] };
    }

    const perfiles = await db.query.perfilesResidente.findMany({
      where:  (p, { eq }) => eq(p.fraccionamientoId, fraccionamientoId),
      with: {
        usuario: true,
        pagos: {
          where: (pg, { eq }) => eq(pg.estado, 'pagado'),
          columns: { mes: true, anio: true },
        },
      },
    });

    const cargosPendientes = await db.select({
      id: cargosServicios.id,
      perfilId: cargosServicios.perfilId,
      mes: cargosServicios.mes,
      anio: cargosServicios.anio,
      monto: cargosServicios.monto,
      servicio: servicios.nombre,
    }).from(cargosServicios)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(cargosServicios.fraccionamientoId, fraccionamientoId),
        eq(cargosServicios.estado, 'pendiente'),
        ne(servicios.clave, 'agua'),
      ));

    return {
      fraccionamiento,
      perfiles,
      cargosPendientes,
    };
  }

  async findFraccionamientoForCobro(fraccionamientoId: string): Promise<FraccionamientoParaCobro | null> {
    const row = await db.query.fraccionamientos.findFirst({
      where: (f, { and, eq }) => and(eq(f.id, fraccionamientoId), eq(f.activo, true)),
      columns: { montoMensual: true, montoReconexion: true, representanteId: true },
    });
    return row ?? null;
  }

  async findFraccionamientoForCobroTesorera(
    fraccionamientoId: string,
    tesoreraId: string,
  ): Promise<FraccionamientoParaCobro | null> {
    const row = await db.query.fraccionamientos.findFirst({
      where: (f, { and, eq }) => and(eq(f.id, fraccionamientoId), eq(f.tesoreraId, tesoreraId), eq(f.activo, true)),
      columns: { montoMensual: true, montoReconexion: true, representanteId: true },
    });
    return row ?? null;
  }

  async findComprobantePendiente(
    perfilId: string,
    fraccionamientoId: string,
  ): Promise<ComprobantePendienteRow | null> {
    const [comprobante] = await db
      .select({
        id:             comprobantesTransferencia.id,
        estado:         comprobantesTransferencia.estado,
        monto:          comprobantesTransferencia.monto,
        concepto:       comprobantesTransferencia.concepto,
        fechaEmision:   comprobantesTransferencia.fechaEmision,
        motivoRechazo:  comprobantesTransferencia.motivoRechazo,
        metadatos:      comprobantesTransferencia.metadatos,
      })
      .from(comprobantesTransferencia)
      .where(and(
        eq(comprobantesTransferencia.perfilId, perfilId),
        eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
      ))
      .orderBy(desc(comprobantesTransferencia.creadoEn))
      .limit(1);

    return comprobante ?? null;
  }

  async findComprobantesPendientesDeResidente(
    perfilId: string,
    fraccionamientoId: string,
  ): Promise<ComprobantePendienteRow[]> {
    return db
      .select({
        id:             comprobantesTransferencia.id,
        estado:         comprobantesTransferencia.estado,
        monto:          comprobantesTransferencia.monto,
        concepto:       comprobantesTransferencia.concepto,
        fechaEmision:   comprobantesTransferencia.fechaEmision,
        motivoRechazo:  comprobantesTransferencia.motivoRechazo,
        metadatos:      comprobantesTransferencia.metadatos,
      })
      .from(comprobantesTransferencia)
      .where(and(
        eq(comprobantesTransferencia.perfilId, perfilId),
        eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      ))
      .orderBy(desc(comprobantesTransferencia.creadoEn));
  }

  async findComprobantesPendientesDeFraccionamiento(
    fraccionamientoId: string,
  ): Promise<ComprobanteConResidente[]> {
    return db
      .select({
        id:             comprobantesTransferencia.id,
        estado:         comprobantesTransferencia.estado,
        monto:          comprobantesTransferencia.monto,
        concepto:       comprobantesTransferencia.concepto,
        comprobanteUrl: comprobantesTransferencia.comprobanteUrl,
        fechaEmision:   comprobantesTransferencia.fechaEmision,
        motivoRechazo:  comprobantesTransferencia.motivoRechazo,
        metadatos:      comprobantesTransferencia.metadatos,
        perfilId:       comprobantesTransferencia.perfilId,
        residenteNombre: user.name,
        residenteEmail:  user.email,
        edificio:        perfilesResidente.edificio,
        departamento:    perfilesResidente.departamento,
      })
      .from(comprobantesTransferencia)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, comprobantesTransferencia.perfilId))
      .innerJoin(user, eq(user.id, perfilesResidente.userId))
      .where(and(
        eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      ))
      .orderBy(desc(comprobantesTransferencia.creadoEn));
  }

  async findTodosComprobantesDeFraccionamiento(
    fraccionamientoId: string,
    estado?: string,
  ): Promise<ComprobanteConResidenteCompleto[]> {
    const whereEstado = !estado || estado === 'todos'
      ? undefined
      : eq(comprobantesTransferencia.estado, estado as 'pendiente_validacion' | 'aprobado' | 'rechazado');

    return db
      .select({
        id:              comprobantesTransferencia.id,
        estado:          comprobantesTransferencia.estado,
        monto:           comprobantesTransferencia.monto,
        concepto:        comprobantesTransferencia.concepto,
        comprobanteUrl:  comprobantesTransferencia.comprobanteUrl,
        fechaEmision:    comprobantesTransferencia.fechaEmision,
        fechaRevision:   comprobantesTransferencia.fechaRevision,
        motivoRechazo:   comprobantesTransferencia.motivoRechazo,
        metadatos:       comprobantesTransferencia.metadatos,
        perfilId:        comprobantesTransferencia.perfilId,
        pagoId:          comprobantesTransferencia.pagoId,
        residenteNombre: user.name,
        residenteEmail:  user.email,
        edificio:        perfilesResidente.edificio,
        departamento:    perfilesResidente.departamento,
      })
      .from(comprobantesTransferencia)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, comprobantesTransferencia.perfilId))
      .innerJoin(user, eq(user.id, perfilesResidente.userId))
      .where(whereEstado
        ? and(
            eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
            whereEstado,
          )
        : eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId))
      .orderBy(desc(comprobantesTransferencia.creadoEn));
  }

  async findComprobanteForAprobacion(
    comprobanteId: string,
    fraccionamientoId: string,
  ): Promise<Record<string, unknown> | null> {
    const [comprobante] = await db
      .select()
      .from(comprobantesTransferencia)
      .where(and(
        eq(comprobantesTransferencia.id, comprobanteId),
        eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      ))
      .limit(1);

    return (comprobante as Record<string, unknown>) ?? null;
  }

  async findComprobanteForRechazo(
    comprobanteId: string,
    fraccionamientoId: string,
  ): Promise<{ id: string; perfilId: string } | null> {
    const [comprobante] = await db
      .select({ id: comprobantesTransferencia.id, perfilId: comprobantesTransferencia.perfilId })
      .from(comprobantesTransferencia)
      .where(and(
        eq(comprobantesTransferencia.id, comprobanteId),
        eq(comprobantesTransferencia.fraccionamientoId, fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      ))
      .limit(1);

    return comprobante ?? null;
  }

  async rechazarComprobante(input: RechazarComprobanteInput): Promise<void> {
    const revisadoEn = new Date();
    await db.transaction(async (tx) => {
      const [actualizado] = await tx.update(comprobantesTransferencia).set({
        estado: 'rechazado',
        motivoRechazo: input.motivoRechazo,
        fechaRevision: revisadoEn,
        revisadoPor: input.revisadoPor,
        actualizadoEn: revisadoEn,
      }).where(and(
        eq(comprobantesTransferencia.id, input.comprobanteId),
        eq(comprobantesTransferencia.fraccionamientoId, input.fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      )).returning({ id: comprobantesTransferencia.id });
      if (!actualizado) {
        throw new TRPCError({ code: 'CONFLICT', message: 'El comprobante ya fue revisado por otra solicitud' });
      }

      await tx.insert(auditoria).values({
        actorId: input.revisadoPor,
        accion: 'comprobante_transferencia.rechazado',
        entidad: 'comprobantes_transferencia',
        entidadId: input.comprobanteId,
        detalle: { perfilId: input.perfilId, motivo: input.motivoRechazo },
      });
    });
  }

  async registrarCargosObligatoriosManuales(
    input: RegistrarCargosObligatoriosManualesInput,
  ): Promise<{ cargos: number; monto: number }> {
    const cargoIds = [...new Set(input.cargoIds)];
    if (cargoIds.length === 0) return { cargos: 0, monto: 0 };

    return db.transaction(async (tx) => {
      const pendientes = await tx.select({
        id: cargosServicios.id,
        monto: cargosServicios.monto,
        servicio: servicios.nombre,
      }).from(cargosServicios)
        .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
        .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
        .where(and(
          eq(cargosServicios.perfilId, input.perfilId),
          eq(cargosServicios.fraccionamientoId, input.fraccionamientoId),
          eq(cargosServicios.estado, 'pendiente'),
          ne(servicios.clave, 'agua'),
          inArray(cargosServicios.id, cargoIds),
        ));
      if (pendientes.length !== cargoIds.length) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Uno o más servicios ya no están disponibles; actualiza la lista' });
      }

      let monto = 0;
      let cargos = 0;
      for (const cargo of pendientes) {
        const folio = generarFolioServicio();
        const [updated] = await tx.update(cargosServicios).set({
          estado: 'pagado',
          metodo: input.metodo,
          folio,
          pagadoEn: new Date(),
        }).where(and(eq(cargosServicios.id, cargo.id), eq(cargosServicios.estado, 'pendiente')))
          .returning({ id: cargosServicios.id });
        if (!updated) throw new TRPCError({ code: 'CONFLICT', message: 'Un cargo cambió de estado durante la aprobación; vuelve a revisar la transferencia' });
        cargos += 1;
        monto += Number(cargo.monto);
        await tx.insert(auditoria).values({
          actorId: input.actorId,
          accion: 'servicio.cargo.pagado_manual_combinado',
          entidad: 'cargos_servicios',
          entidadId: cargo.id,
          detalle: { perfilId: input.perfilId, fraccionamientoId: input.fraccionamientoId, metodo: input.metodo, folio, servicio: cargo.servicio },
        });
        await tx.insert(tickets).values({
          pagoId: null,
          cargoServicioId: cargo.id,
          tipo: 'servicio',
          folio,
          pdfUrl: null,
        });
      }
      if (input.comprobanteId) {
        const [comprobante] = await tx.select({ metadatos: comprobantesTransferencia.metadatos })
          .from(comprobantesTransferencia)
          .where(eq(comprobantesTransferencia.id, input.comprobanteId))
          .limit(1);
        if (!comprobante) throw new TRPCError({ code: 'NOT_FOUND', message: 'No se encontró el comprobante aprobado' });
        await tx.update(comprobantesTransferencia).set({
          metadatos: { ...(comprobante.metadatos ?? {}), cargosAcreditadosIds: pendientes.map(cargo => cargo.id) },
          actualizadoEn: new Date(),
        }).where(eq(comprobantesTransferencia.id, input.comprobanteId));
      }
      return { cargos, monto };
    });
  }

  async crearComprobanteTransferencia(
    input: CrearComprobanteTransferenciaInput,
  ): Promise<{ id: string }> {
    const pendientes = await db
      .select({
        id: comprobantesTransferencia.id,
        metadatos: comprobantesTransferencia.metadatos,
      })
      .from(comprobantesTransferencia)
      .where(and(
        eq(comprobantesTransferencia.perfilId, input.perfilId),
        eq(comprobantesTransferencia.fraccionamientoId, input.fraccionamientoId),
        eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
      ));

    const mesesEnRevision = new Set<string>();
    const cargosEnRevision = new Set<string>();
    const periodosServicioEnRevision = new Set<string>();
    if (pendientes.length > 0) {
      for (const p of pendientes) {
        const meta = p.metadatos as {
          meses?: Array<{ mes: number; anio: number }>;
          cargosServicioIds?: string[];
          servicios?: Array<{ fraccionamientoServicioId: string; periodos: Array<{ mes: number; anio: number }> }>;
        } | null;
        if (meta?.meses && Array.isArray(meta.meses)) {
          for (const m of meta.meses) {
            mesesEnRevision.add(`${m.anio}-${m.mes}`);
          }
        }
        if (meta?.cargosServicioIds && Array.isArray(meta.cargosServicioIds)) {
          for (const cId of meta.cargosServicioIds) {
            cargosEnRevision.add(cId);
          }
        }
        for (const servicio of meta?.servicios ?? []) {
          for (const periodo of servicio.periodos ?? []) {
            periodosServicioEnRevision.add(`${servicio.fraccionamientoServicioId}:${periodo.anio}-${periodo.mes}`);
          }
        }
      }

      if (input.metadatos?.meses && Array.isArray(input.metadatos.meses)) {
        for (const m of input.metadatos.meses) {
          if (mesesEnRevision.has(`${m.anio}-${m.mes}`)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `El periodo ${m.mes}/${m.anio} de agua ya tiene un comprobante en revisión por tu tesorera.`,
            });
          }
        }
      }

      if (input.metadatos?.cargosServicioIds && Array.isArray(input.metadatos.cargosServicioIds)) {
        for (const cId of input.metadatos.cargosServicioIds) {
          if (cargosEnRevision.has(cId)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Uno o más servicios seleccionados ya tienen un comprobante en revisión por tu tesorera.',
            });
          }
        }
      }
      for (const servicio of input.serviciosSolicitados) {
        for (const periodo of servicio.periodos) {
          if (periodosServicioEnRevision.has(`${servicio.fraccionamientoServicioId}:${periodo.anio}-${periodo.mes}`)) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Un servicio y periodo seleccionado ya tiene un comprobante en revisión.' });
          }
        }
      }
    }

    const creado = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${input.perfilId} FOR UPDATE`);
      const pendientesActuales = await tx.select({ metadatos: comprobantesTransferencia.metadatos })
        .from(comprobantesTransferencia)
        .where(and(
          eq(comprobantesTransferencia.perfilId, input.perfilId),
          eq(comprobantesTransferencia.fraccionamientoId, input.fraccionamientoId),
          eq(comprobantesTransferencia.estado, 'pendiente_validacion'),
        ));
      for (const pendiente of pendientesActuales) {
        const meta = pendiente.metadatos as typeof input.metadatos | null;
        const existingPeriods = new Set((meta?.meses ?? []).map(periodo => `${periodo.anio}-${periodo.mes}`));
        const existingCargoIds = new Set(meta?.cargosServicioIds ?? []);
        const existingServicePeriods = new Set((meta?.servicios ?? []).flatMap(servicio =>
          servicio.periodos.map(periodo => `${servicio.fraccionamientoServicioId}:${periodo.anio}-${periodo.mes}`)));
        const conflicts = input.periodosSolicitados.some(periodo => existingPeriods.has(`${periodo.anio}-${periodo.mes}`))
          || input.cargosSolicitados.some(cargoId => existingCargoIds.has(cargoId))
          || input.serviciosSolicitados.some(servicio => servicio.periodos.some(periodo =>
            existingServicePeriods.has(`${servicio.fraccionamientoServicioId}:${periodo.anio}-${periodo.mes}`)));
        if (conflicts) throw new TRPCError({ code: 'CONFLICT', message: 'Uno o más periodos o cargos ya tienen un comprobante pendiente de revisión.' });
      }
      const nuevosCargosIds: string[] = [];
      for (const seleccion of input.serviciosSolicitados) {
        const [servicioTenant] = await tx.select({
          id: fraccionamientoServicios.id,
          montoMensual: fraccionamientoServicios.montoMensual,
          clave: servicios.clave,
        }).from(fraccionamientoServicios)
          .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
          .where(and(
            eq(fraccionamientoServicios.id, seleccion.fraccionamientoServicioId),
            eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId),
            eq(fraccionamientoServicios.estado, 'activo'),
            eq(servicios.activo, true),
            ne(servicios.clave, 'agua'),
          )).limit(1);
        if (!servicioTenant) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Uno de los servicios seleccionados ya no está activo en tu fraccionamiento.' });
        }

        for (const periodo of seleccion.periodos) {
          const existente = await tx.query.cargosServicios.findFirst({
            where: (cargo, { and, eq }) => and(
              eq(cargo.perfilId, input.perfilId),
              eq(cargo.fraccionamientoServicioId, servicioTenant.id),
              eq(cargo.mes, periodo.mes),
              eq(cargo.anio, periodo.anio),
            ),
            columns: { id: true, estado: true },
          });
          if (existente && existente.estado !== 'pendiente') {
            throw new TRPCError({ code: 'CONFLICT', message: `El cargo de ${periodo.mes}/${periodo.anio} ya fue resuelto.` });
          }
          const [insertado] = existente ? [null] : await tx.insert(cargosServicios).values({
            fraccionamientoId: input.fraccionamientoId,
            perfilId: input.perfilId,
            fraccionamientoServicioId: servicioTenant.id,
            mes: periodo.mes,
            anio: periodo.anio,
            monto: servicioTenant.montoMensual,
            estado: 'pendiente',
          }).onConflictDoNothing().returning({ id: cargosServicios.id });
          const cargoActual = existente ?? (insertado
            ? { id: insertado.id, estado: 'pendiente' }
            : await tx.query.cargosServicios.findFirst({
              where: (cargo, { and, eq }) => and(
                eq(cargo.perfilId, input.perfilId),
                eq(cargo.fraccionamientoServicioId, servicioTenant.id),
                eq(cargo.mes, periodo.mes),
                eq(cargo.anio, periodo.anio),
              ),
              columns: { id: true, estado: true },
            }));
          if (!cargoActual || cargoActual.estado !== 'pendiente') {
            throw new TRPCError({ code: 'CONFLICT', message: `No se pudo reservar el cargo de ${periodo.mes}/${periodo.anio}.` });
          }
          if (cargosEnRevision.has(cargoActual.id)) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Este servicio y periodo ya está asociado a una transferencia en revisión.' });
          }
          nuevosCargosIds.push(cargoActual.id);
        }
      }

      const metadatos = input.metadatos
        ? { ...input.metadatos, cargosServicioIds: [...new Set([...input.cargosSolicitados, ...nuevosCargosIds])] }
        : null;
      const [row] = await tx.insert(comprobantesTransferencia).values({
        perfilId: input.perfilId,
        fraccionamientoId: input.fraccionamientoId,
        monto: input.monto,
        concepto: input.concepto,
        comprobanteUrl: input.comprobanteUrl,
        estado: 'pendiente_validacion',
        metadatos,
      }).returning({ id: comprobantesTransferencia.id });
      return row;
    });

    return { id: creado.id };
  }
}
