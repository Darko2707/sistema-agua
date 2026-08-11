import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { pushDeliveries, pushSubscriptions } from '@/db/schema';

const MAX_DEVICES_PER_USER = 10;

const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

function isMicrosoftPushHost(hostname: string): boolean {
  return hostname === 'notify.windows.com' || hostname.endsWith('.notify.windows.com');
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    return EXACT_PUSH_HOSTS.has(hostname) || isMicrosoftPushHost(hostname);
  } catch {
    return false;
  }
}

export function hashPushEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

export type SavePushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
};

export async function savePushSubscription(
  userId: string,
  input: SavePushSubscriptionInput,
): Promise<void> {
  const now = new Date();
  const endpointHash = hashPushEndpoint(input.endpoint);

  await db.transaction(async (tx) => {
    // El endpoint serializa cambios de cuenta y la fila de usuario serializa
    // altas simultaneas de dispositivos para que el limite sea estricto.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${endpointHash}, 0))`);
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);

    const [saved] = await tx.insert(pushSubscriptions).values({
      userId,
      endpointHash,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime: input.expirationTime === null ? null : new Date(input.expirationTime),
      userAgent: input.userAgent,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: pushSubscriptions.endpointHash,
      set: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime: input.expirationTime === null ? null : new Date(input.expirationTime),
        userAgent: input.userAgent,
        updatedAt: now,
      },
    }).returning({ id: pushSubscriptions.id });

    // A browser endpoint can be rebound when a shared device changes account.
    // Remove outstanding deliveries for the previous account in the same
    // transaction so the new resident can never receive an old resident's data.
    await tx.execute(sql`
      DELETE FROM push_deliveries
      USING notificaciones
      WHERE push_deliveries.subscription_id = ${saved.id}
        AND push_deliveries.notification_id = notificaciones.id
        AND notificaciones.user_id IS DISTINCT FROM ${userId}
    `);

    const devices = await tx.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(desc(pushSubscriptions.updatedAt));

    const obsoleteIds = devices.slice(MAX_DEVICES_PER_USER).map((item) => item.id);
    if (obsoleteIds.length > 0) {
      await tx.update(pushDeliveries)
        .set({
          estado: 'fallida',
          lockedAt: null,
          lastError: 'device_limit',
          updatedAt: now,
        })
        .where(and(
          inArray(pushDeliveries.subscriptionId, obsoleteIds),
          eq(pushDeliveries.estado, 'pendiente'),
        ));
      await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, obsoleteIds));
    }
  });
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const endpointHash = hashPushEndpoint(endpoint);
  return db.transaction(async (tx) => {
    // Usa el mismo orden de locks que savePushSubscription para no competir
    // con un upsert o un cambio de cuenta del mismo navegador.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${endpointHash}, 0))`);
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);

    const rows = await tx.select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpointHash, endpointHash),
      ));
    if (rows.length === 0) return false;

    const ids = rows.map((row) => row.id);
    await tx.update(pushDeliveries)
      .set({
        estado: 'fallida',
        lockedAt: null,
        lastError: 'unsubscribed',
        updatedAt: new Date(),
      })
      .where(and(
        inArray(pushDeliveries.subscriptionId, ids),
        eq(pushDeliveries.estado, 'pendiente'),
      ));
    await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids));
    return true;
  });
}
