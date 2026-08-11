export type PushNotificationType =
  | 'pago_confirmado'
  | 'corte_proximo'
  | 'corte_confirmado'
  | 'reconexion_confirmada';

/**
 * Datos del evento que se persiste en el outbox de notificaciones.
 * El destino real se resuelve por userId al despachar las suscripciones push.
 */
export type PushNotificationInput = {
  userId: string;
  perfilId: string;
  tipo: PushNotificationType;
  mensaje: string;
  dedupeKey: string;
  expiresAt?: Date;
};
