import 'server-only';

import * as Sentry from '@sentry/nextjs';
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { after } from 'next/server';

import { db } from '@/db';
import {
  notificaciones,
  pagos,
  pushDeliveries,
  pushSubscriptions,
} from '@/db/schema';
import { logger } from '@/lib/logger';
import {
  classifyPushFailure,
  pushFailureLabel,
  pushRetryAfterMs,
  sendPushNotification,
  type PushPayload,
} from '@/lib/push';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1_000;

type ClaimedDelivery = {
  id: string;
  notificationId: string;
  subscriptionId: string;
  attempts: number;
  endpoint: string;
  expirationTime: Date | null;
  p256dh: string;
  auth: string;
  notificationType: string;
  dedupeKey: string | null;
};

type DeliveryOutcome = 'delivered' | 'retrying' | 'failed' | 'stale' | 'configuration';

export type PushDispatchResult = {
  notificationsPrepared: number;
  claimed: number;
  delivered: number;
  retrying: number;
  failed: number;
  staleSubscriptions: number;
  configurationErrors: number;
};

function payloadFor(item: ClaimedDelivery): PushPayload {
  switch (item.notificationType) {
    case 'pago_confirmado':
      return {
        title: 'Pago confirmado',
        body: 'Tu pago fue registrado. Consulta el comprobante dentro de la aplicacion.',
        url: '/residente/folios',
        tag: item.dedupeKey ?? item.notificationId,
      };
    case 'corte_proximo':
    case 'corte_pendiente':
      return {
        title: 'Aviso de servicio de agua',
        body: 'Tienes un pago pendiente. Consulta tu estado dentro de la aplicacion.',
        url: '/residente',
        tag: item.dedupeKey ?? item.notificationId,
      };
    case 'corte_confirmado':
      return {
        title: 'Actualizacion del servicio',
        body: 'Consulta el estado actual de tu servicio dentro de la aplicacion.',
        url: '/residente',
        tag: item.dedupeKey ?? item.notificationId,
      };
    case 'reconexion_confirmada':
      return {
        title: 'Reconexion confirmada',
        body: 'Tu servicio fue actualizado. Consulta los detalles dentro de la aplicacion.',
        url: '/residente',
        tag: item.dedupeKey ?? item.notificationId,
      };
    default:
      return {
        title: 'Sistema de Agua',
        body: 'Tienes una actualizacion disponible dentro de la aplicacion.',
        url: '/residente',
        tag: item.dedupeKey ?? item.notificationId,
      };
  }
}

async function prepareDeliveries(notificationLimit: number): Promise<string[]> {
  const now = new Date();
  const expired = await db.update(notificaciones)
    .set({
      estado: 'fallida',
      error: 'La vigencia de la notificacion termino antes de ser entregada',
    })
    .where(and(
      eq(notificaciones.canal, 'push'),
      eq(notificaciones.estado, 'pendiente'),
      lte(notificaciones.expiresAt, now),
    ))
    .returning({ id: notificaciones.id });

  if (expired.length > 0) {
    await db.update(pushDeliveries)
      .set({
        estado: 'fallida',
        lockedAt: null,
        lastError: 'expired',
        updatedAt: now,
      })
      .where(and(
        inArray(pushDeliveries.notificationId, expired.map((item) => item.id)),
        eq(pushDeliveries.estado, 'pendiente'),
      ));
  }

  const pending = await db.select({
    id: notificaciones.id,
    userId: notificaciones.userId,
  })
    .from(notificaciones)
    .where(and(
      eq(notificaciones.canal, 'push'),
      eq(notificaciones.estado, 'pendiente'),
    ))
    .orderBy(asc(notificaciones.creadoEn))
    .limit(notificationLimit);

  if (pending.length === 0) return [];

  const usable = pending.filter(
    (item): item is { id: string; userId: string } => item.userId !== null,
  );
  const allIds = pending.map((item) => item.id);

  if (usable.length > 0) {
    const usableIds = usable.map((item) => item.id);
    await db.execute(sql`
      INSERT INTO ${pushDeliveries} (notification_id, subscription_id)
      SELECT ${notificaciones.id}, ${pushSubscriptions.id}
      FROM ${notificaciones}
      INNER JOIN ${pushSubscriptions}
        ON ${pushSubscriptions.userId} = ${notificaciones.userId}
        AND (${pushSubscriptions.expirationTime} IS NULL OR ${pushSubscriptions.expirationTime} > now())
      WHERE ${inArray(notificaciones.id, usableIds)}
      ON CONFLICT (notification_id, subscription_id) DO NOTHING
    `);
  }

  const withoutDelivery = await db.select({ id: notificaciones.id })
    .from(notificaciones)
    .where(and(
      inArray(notificaciones.id, allIds),
      notExists(
        db.select({ id: pushDeliveries.id })
          .from(pushDeliveries)
          .where(eq(pushDeliveries.notificationId, notificaciones.id)),
      ),
    ));

  if (withoutDelivery.length > 0) {
    await db.update(notificaciones)
      .set({
        estado: 'fallida',
        error: 'No hay un dispositivo con notificaciones activadas',
      })
      .where(inArray(notificaciones.id, withoutDelivery.map((item) => item.id)));
  }

  return allIds;
}

async function claimDeliveries(limit: number): Promise<ClaimedDelivery[]> {
  const now = new Date();
  const staleLease = new Date(now.getTime() - LEASE_MS);

  return db.transaction(async (tx) => {
    const rows = await tx.select({
      id: pushDeliveries.id,
      notificationId: pushDeliveries.notificationId,
      subscriptionId: pushSubscriptions.id,
      attempts: pushDeliveries.attempts,
      endpoint: pushSubscriptions.endpoint,
      expirationTime: pushSubscriptions.expirationTime,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      notificationType: notificaciones.tipo,
      dedupeKey: notificaciones.dedupeKey,
    })
      .from(pushDeliveries)
      .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, pushDeliveries.subscriptionId))
      .innerJoin(notificaciones, eq(notificaciones.id, pushDeliveries.notificationId))
      .where(and(
        eq(pushDeliveries.estado, 'pendiente'),
        eq(notificaciones.estado, 'pendiente'),
        eq(notificaciones.userId, pushSubscriptions.userId),
        or(isNull(pushSubscriptions.expirationTime), gt(pushSubscriptions.expirationTime, now)),
        or(isNull(notificaciones.expiresAt), gt(notificaciones.expiresAt, now)),
        lte(pushDeliveries.nextAttemptAt, now),
        or(isNull(pushDeliveries.lockedAt), lt(pushDeliveries.lockedAt, staleLease)),
      ))
      .orderBy(asc(pushDeliveries.nextAttemptAt), asc(pushDeliveries.createdAt))
      .limit(limit)
      .for('update', { of: pushDeliveries, skipLocked: true });

    if (rows.length === 0) return [];

    await tx.update(pushDeliveries)
      .set({
        attempts: sql`${pushDeliveries.attempts} + 1`,
        lockedAt: now,
        updatedAt: now,
      })
      .where(inArray(pushDeliveries.id, rows.map((row) => row.id)));

    return rows.map((row) => ({ ...row, attempts: row.attempts + 1 }));
  });
}

function retryAt(attempts: number, configurationFailure: boolean, retryAfterMs?: number | null): Date {
  const baseMs = configurationFailure ? 60 * 60 * 1_000 : 30 * 1_000;
  const calculatedBackoff = retryAfterMs ?? Math.min(
    baseMs * (2 ** Math.max(0, attempts - 1)),
    6 * 60 * 60 * 1_000,
  );
  // Even a malformed/past Retry-After must not create a hot retry loop in the
  // same function invocation.
  const backoff = Math.max(calculatedBackoff, 30_000);
  const jitter = Math.floor(Math.random() * Math.min(backoff * 0.2, 60_000));
  return new Date(Date.now() + backoff + jitter);
}

async function processDelivery(item: ClaimedDelivery): Promise<DeliveryOutcome> {
  // A payment can cancel a cutoff warning after this delivery was claimed.
  // Re-read the parent and subscription immediately before the network call
  // so cancelled/expired messages and endpoints rebound to another account
  // are not sent from a stale in-memory claim.
  const now = new Date();
  const [current] = await db.select({
    endpoint: pushSubscriptions.endpoint,
    expirationTime: pushSubscriptions.expirationTime,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    notificationType: notificaciones.tipo,
    dedupeKey: notificaciones.dedupeKey,
    perfilId: notificaciones.perfilId,
  })
    .from(pushDeliveries)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, pushDeliveries.subscriptionId))
    .innerJoin(notificaciones, eq(notificaciones.id, pushDeliveries.notificationId))
    .where(and(
      eq(pushDeliveries.id, item.id),
      eq(pushDeliveries.estado, 'pendiente'),
      eq(notificaciones.estado, 'pendiente'),
      eq(notificaciones.userId, pushSubscriptions.userId),
      or(isNull(pushSubscriptions.expirationTime), gt(pushSubscriptions.expirationTime, now)),
      or(isNull(notificaciones.expiresAt), gt(notificaciones.expiresAt, now)),
    ))
    .limit(1);

  if (!current) {
    await db.update(pushDeliveries)
      .set({
        estado: 'fallida',
        lockedAt: null,
        lastError: 'cancelled_or_expired',
        updatedAt: now,
      })
      .where(and(
        eq(pushDeliveries.id, item.id),
        eq(pushDeliveries.estado, 'pendiente'),
      ));
    return 'failed';
  }

  if (current.notificationType === 'corte_proximo' && current.perfilId) {
    const period = /^corte_proximo:[^:]+:(\d{4})-(\d{2})$/.exec(current.dedupeKey ?? '');
    if (period) {
      const [payment] = await db.select({ id: pagos.id })
        .from(pagos)
        .where(and(
          eq(pagos.perfilId, current.perfilId),
          eq(pagos.anio, Number(period[1])),
          eq(pagos.mes, Number(period[2])),
          eq(pagos.estado, 'pagado'),
        ))
        .limit(1);

      if (payment) {
        await db.transaction(async (tx) => {
          await tx.update(notificaciones)
            .set({ estado: 'fallida', error: 'Aviso cancelado porque el pago ya fue registrado' })
            .where(and(
              eq(notificaciones.id, item.notificationId),
              eq(notificaciones.estado, 'pendiente'),
            ));
          await tx.update(pushDeliveries)
            .set({
              estado: 'fallida',
              lockedAt: null,
              lastError: 'payment_completed',
              updatedAt: new Date(),
            })
            .where(and(
              eq(pushDeliveries.notificationId, item.notificationId),
              eq(pushDeliveries.estado, 'pendiente'),
            ));
        });
        return 'failed';
      }
    }
  }

  try {
    await sendPushNotification(
      {
        endpoint: current.endpoint,
        expirationTime: current.expirationTime,
        p256dh: current.p256dh,
        auth: current.auth,
      },
      payloadFor({ ...item, ...current }),
      current.dedupeKey ?? item.notificationId,
    );

    await db.update(pushDeliveries)
      .set({
        estado: 'enviada',
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(pushDeliveries.id, item.id));
    return 'delivered';
  } catch (error) {
    const kind = classifyPushFailure(error);
    const label = pushFailureLabel(error);

    if (kind === 'stale') {
      await db.transaction(async (tx) => {
        // Finish every queued delivery for this obsolete endpoint before
        // deleting the subscription. The FK keeps the terminal rows with a
        // null subscription_id for operational history.
        await tx.update(pushDeliveries)
          .set({
            estado: 'fallida',
            lockedAt: null,
            lastError: label,
            updatedAt: new Date(),
          })
          .where(and(
            eq(pushDeliveries.subscriptionId, item.subscriptionId),
            eq(pushDeliveries.estado, 'pendiente'),
          ));
        await tx.delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, item.subscriptionId));
      });
      return 'stale';
    }

    if (kind === 'configuration') {
      // A broken VAPID configuration is global, not a bad device. Preserve the
      // subscription and do not consume its retry budget; the batch dispatcher
      // opens a circuit breaker after the current small claim.
      await db.update(pushDeliveries)
        .set({
          attempts: sql`greatest(${pushDeliveries.attempts} - 1, 0)`,
          nextAttemptAt: retryAt(1, true),
          lockedAt: null,
          lastError: label,
          updatedAt: new Date(),
        })
        .where(eq(pushDeliveries.id, item.id));
      return 'configuration';
    }

    const canRetry = item.attempts < MAX_ATTEMPTS && kind === 'transient';

    await db.update(pushDeliveries)
      .set(canRetry
        ? {
            nextAttemptAt: retryAt(item.attempts, false, pushRetryAfterMs(error)),
            lockedAt: null,
            lastError: label,
            updatedAt: new Date(),
          }
        : {
            estado: 'fallida',
            lockedAt: null,
            lastError: label,
            updatedAt: new Date(),
      })
      .where(eq(pushDeliveries.id, item.id));

    return canRetry ? 'retrying' : 'failed';
  }
}

async function processWithConcurrency(
  items: ClaimedDelivery[],
  concurrency: number,
): Promise<DeliveryOutcome[]> {
  const results = new Array<DeliveryOutcome>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await processDelivery(items[index]);
      } catch (error) {
        // A database write failure must not abort the other independent
        // deliveries. This row remains leased and becomes claimable again.
        logger.error('push.delivery.persistence_error', error, {
          notificationId: items[index].notificationId,
        });
        results[index] = 'retrying';
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function finalizeNotifications(notificationIds: string[]): Promise<void> {
  const ids = [...new Set(notificationIds)];
  if (ids.length === 0) return;

  const aggregates = await db.select({
    notificationId: pushDeliveries.notificationId,
    pending: sql<number>`count(*) filter (where ${pushDeliveries.estado} = 'pendiente')::int`,
    sent: sql<number>`count(*) filter (where ${pushDeliveries.estado} = 'enviada')::int`,
  })
    .from(pushDeliveries)
    .where(inArray(pushDeliveries.notificationId, ids))
    .groupBy(pushDeliveries.notificationId);

  const sentIds = aggregates
    .filter((item) => item.sent > 0 && item.pending === 0)
    .map((item) => item.notificationId);
  const failedIds = aggregates
    .filter((item) => item.sent === 0 && item.pending === 0)
    .map((item) => item.notificationId);
  const represented = new Set(aggregates.map((item) => item.notificationId));
  failedIds.push(...ids.filter((id) => !represented.has(id)));

  if (sentIds.length > 0) {
    await db.update(notificaciones)
      .set({ estado: 'enviada', enviadoEn: new Date(), error: null })
      .where(and(
        inArray(notificaciones.id, sentIds),
        eq(notificaciones.estado, 'pendiente'),
      ));
  }

  if (failedIds.length > 0) {
    await db.update(notificaciones)
      .set({ estado: 'fallida', error: 'No fue posible entregar la notificacion push' })
      .where(and(
        inArray(notificaciones.id, [...new Set(failedIds)]),
        eq(notificaciones.estado, 'pendiente'),
      ));
  }
}

export async function dispatchPendingPushNotifications(options?: {
  notificationLimit?: number;
  deliveryLimit?: number;
  concurrency?: number;
  timeBudgetMs?: number;
}): Promise<PushDispatchResult> {
  const notificationLimit = Math.min(Math.max(options?.notificationLimit ?? 1_000, 1), 2_000);
  const deliveryLimit = Math.min(Math.max(options?.deliveryLimit ?? 2_000, 1), 10_000);
  const concurrency = Math.min(Math.max(options?.concurrency ?? 20, 1), 25);
  const timeBudgetMs = Math.min(Math.max(options?.timeBudgetMs ?? 240_000, 5_000), 270_000);
  const claimSize = Math.min(concurrency * 2, 50);
  const startedAt = Date.now();

  await db.execute(sql`
    WITH expired AS MATERIALIZED (
      SELECT id
      FROM push_subscriptions
      WHERE expiration_time IS NOT NULL AND expiration_time <= now()
    ), terminal AS (
      UPDATE push_deliveries
      SET
        estado = 'fallida',
        locked_at = NULL,
        last_error = 'subscription_expired',
        updated_at = now()
      FROM expired
      WHERE push_deliveries.subscription_id = expired.id
        AND push_deliveries.estado = 'pendiente'
      RETURNING push_deliveries.id
    )
    DELETE FROM push_subscriptions
    USING expired
    WHERE push_subscriptions.id = expired.id
  `);

  // Pagos, expiraciones y bajas pueden terminar el outbox mientras una entrega
  // sigue pendiente. Cerrarla evita leases imposibles y crecimiento indefinido.
  await db.execute(sql`
    UPDATE push_deliveries
    SET
      estado = 'fallida',
      locked_at = NULL,
      last_error = 'notification_terminal',
      updated_at = now()
    FROM notificaciones
    WHERE push_deliveries.notification_id = notificaciones.id
      AND push_deliveries.estado = 'pendiente'
      AND notificaciones.estado <> 'pendiente'
  `);

  // Defensive cleanup for account switches on shared devices. The normal
  // subscription upsert already performs this atomically; this also repairs a
  // delivery materialized by an older deployment or an overlapping worker.
  await db.execute(sql`
    DELETE FROM push_deliveries
    USING notificaciones, push_subscriptions
    WHERE push_deliveries.notification_id = notificaciones.id
      AND push_deliveries.subscription_id = push_subscriptions.id
      AND notificaciones.user_id IS DISTINCT FROM push_subscriptions.user_id
  `);

  const preparedIds = await prepareDeliveries(notificationLimit);
  const result: PushDispatchResult = {
    notificationsPrepared: preparedIds.length,
    claimed: 0,
    delivered: 0,
    retrying: 0,
    failed: 0,
    staleSubscriptions: 0,
    configurationErrors: 0,
  };

  const affectedIds = new Set(preparedIds);
  while (result.claimed < deliveryLimit && Date.now() - startedAt < timeBudgetMs) {
    const claimed = await claimDeliveries(Math.min(claimSize, deliveryLimit - result.claimed));
    if (claimed.length === 0) break;

    const outcomes = await processWithConcurrency(claimed, concurrency);
    result.claimed += claimed.length;
    result.delivered += outcomes.filter((item) => item === 'delivered').length;
    result.retrying += outcomes.filter((item) => item === 'retrying').length;
    result.failed += outcomes.filter((item) => item === 'failed').length;
    result.staleSubscriptions += outcomes.filter((item) => item === 'stale').length;
    result.configurationErrors += outcomes.filter((item) => item === 'configuration').length;
    result.retrying += outcomes.filter((item) => item === 'configuration').length;
    claimed.forEach((item) => affectedIds.add(item.notificationId));

    await finalizeNotifications(claimed.map((item) => item.notificationId));

    if (result.configurationErrors > 0) {
      Sentry.captureMessage('Fallo de configuracion al enviar Web Push', {
        level: 'error',
        tags: { component: 'push', error_type: 'configuration' },
        extra: { affectedDeliveries: result.configurationErrors },
      });
      break;
    }
  }

  await finalizeNotifications([...affectedIds]);

  logger.info('push.dispatch.completed', result);
  return result;
}

export function schedulePushDispatch(): void {
  after(async () => {
    try {
      await dispatchPendingPushNotifications();
    } catch (error) {
      Sentry.captureException(error, { tags: { component: 'push', job: 'post-response' } });
      logger.error('push.dispatch.post_response_error', error);
    }
  });
}
