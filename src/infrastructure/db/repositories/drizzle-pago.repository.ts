import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { auditoria, pagos, cortes, tickets, perfilesResidente, notificaciones } from '@/db/schema';
import type {
  PagoRepository,
  PagoData,
  CrearPagoInput,
  CrearPagosManualBatchInput,
  CrearPagosManualBatchResult,
  CrearPagosMercadoPagoBatchInput,
  CrearPagosMercadoPagoBatchResult,
  CorteData,
  MetricasAdmin,
} from '@/src/application/ports/pago.repository';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import { pushNotificationValues } from '@/src/infrastructure/db/push-notification-outbox';
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
    if (input.pagos.length < 1 || input.pagos.length > 36) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'El lote debe contener entre 1 y 36 periodos' });
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

    return db.transaction(async (tx) => {
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
      if (pago.perfilId !== input.perfilId || pago.mercadoPagoPaymentId !== input.mercadoPagoPaymentId) {
        throw new Error('Todos los periodos deben pertenecer al mismo perfil y paymentId');
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
      await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${input.perfilId} FOR UPDATE`);

      const existentesRelevantes = await tx.query.pagos.findMany({
        where: (p, { eq, and, or }) => and(
          eq(p.estado, 'pagado'),
          or(
            eq(p.perfilId, input.perfilId),
            eq(p.mercadoPagoPaymentId, input.mercadoPagoPaymentId),
          ),
        ),
      });
      const existentesPerfil = existentesRelevantes.filter(pago => pago.perfilId === input.perfilId);
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
        existentesPerfil
          .filter(pago => requestedKeys.has(periodoKey(pago)))
          .map(pago => [periodoKey(pago), pago] as const),
      );
      const conflictos = [...existentesPorPeriodo.values()]
        .filter(pago => pago.mercadoPagoPaymentId !== input.mercadoPagoPaymentId)
        .map(pago => ({
          mes: pago.mes,
          anio: pago.anio,
          existingPaymentId: pago.mercadoPagoPaymentId,
        }));

      // Un paymentId no puede reaparecer con una referencia que describa otros
      // periodos. Se permite solamente completar lotes parciales creados por la
      // implementacion anterior (sus periodos son subconjunto del lote actual).
      const periodosAjenosDelMismoPago = existentesPerfil
        .filter(pago =>
          pago.mercadoPagoPaymentId === input.mercadoPagoPaymentId &&
          !requestedKeys.has(periodoKey(pago)))
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
      let insertados: typeof existentesPerfil = [];
      if (faltantes.length > 0) {
        insertados = await tx.insert(pagos).values(faltantes).returning();

        const perfil = await tx.query.perfilesResidente.findFirst({
          where: (p, { eq }) => eq(p.id, input.perfilId),
        });
        const incluyeReconexion = input.pagos.some(pago => pago.esReconexion);
        if (perfil?.estadoAgua === 'pendiente_corte' && !incluyeReconexion) {
          await tx
            .update(perfilesResidente)
            .set({ estadoAgua: 'activo' })
            .where(eq(perfilesResidente.id, input.perfilId));
        } else if (perfil?.estadoAgua === 'cortado' && incluyeReconexion) {
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

      await tx.execute(cancelCutoffNotificationsQuery(input.perfilId, input.pagos));

      // Un cobro genera un solo mensaje, incluso si acredita doce periodos. El
      // insert queda al final para que nunca se publique antes del lote completo.
      if (faltantes.length > 0) {
        await tx
          .insert(notificaciones)
          .values(pushNotificationValues(input.pushNotification))
          .onConflictDoNothing();
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
    };
  }
}
