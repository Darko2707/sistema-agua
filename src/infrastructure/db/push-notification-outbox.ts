import { db } from '@/db';
import { notificaciones } from '@/db/schema';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';

export function pushNotificationValues(input: PushNotificationInput) {
  return {
    userId: input.userId,
    perfilId: input.perfilId,
    canal: 'push',
    tipo: input.tipo,
    // Se conserva por compatibilidad con el esquema anterior. El dispatcher
    // resuelve los endpoints exclusivamente por userId; nunca se guardan aqui.
    destino: input.userId,
    mensaje: input.mensaje,
    dedupeKey: input.dedupeKey,
    expiresAt: input.expiresAt,
  } as const;
}

export async function enqueuePushNotification(input: PushNotificationInput): Promise<boolean> {
  const inserted = await db
    .insert(notificaciones)
    .values(pushNotificationValues(input))
    .onConflictDoNothing()
    .returning({ id: notificaciones.id });

  return inserted.length > 0;
}
