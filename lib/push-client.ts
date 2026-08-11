export type PushPermission = NotificationPermission | 'unsupported';

export interface PushEnvironment {
  supported: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: PushPermission;
}

export interface SerializedPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type PushClientErrorCode =
  | 'unsupported'
  | 'ios-install-required'
  | 'permission-denied'
  | 'configuration'
  | 'unauthorized'
  | 'network';

export class PushClientError extends Error {
  constructor(
    message: string,
    readonly code: PushClientErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PushClientError';
  }
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const VAPID_KEY_ENDPOINT = '/api/push/vapid-public-key';
const SUBSCRIPTIONS_ENDPOINT = '/api/push/subscriptions';

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true;
}

export function getPushEnvironment(): PushEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, isIos: false, isStandalone: false, permission: 'unsupported' };
  }

  const supported = 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

  return {
    supported,
    isIos: isIosDevice(),
    isStandalone: isStandaloneDisplay(),
    permission: supported ? Notification.permission : 'unsupported',
  };
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+={0,2}$/.test(normalized)) {
    throw new PushClientError('La clave pública de notificaciones no es válida.', 'configuration');
  }

  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = `${normalized}${padding}`.replace(/-/g, '+').replace(/_/g, '/');

  try {
    const raw = window.atob(base64);
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));

    // Una clave pública VAPID P-256 sin comprimir tiene 65 bytes y comienza con 0x04.
    if (bytes.length !== 65 || bytes[0] !== 4) {
      throw new PushClientError('La clave pública de notificaciones no es válida.', 'configuration');
    }

    return bytes;
  } catch (error) {
    if (error instanceof PushClientError) throw error;
    throw new PushClientError('La clave pública de notificaciones no es válida.', 'configuration', { cause: error });
  }
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  } catch {
    // El cuerpo puede no ser JSON; usamos un mensaje seguro y estable.
  }
  return fallback;
}

async function fetchVapidPublicKey(): Promise<string> {
  let response: Response;

  try {
    response = await fetch(VAPID_KEY_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new PushClientError('No pudimos conectar con el servicio de notificaciones.', 'network', { cause: error });
  }

  if (response.status === 401) {
    throw new PushClientError('Tu sesión expiró. Inicia sesión nuevamente.', 'unauthorized');
  }
  if (response.status === 503) {
    throw new PushClientError('Las notificaciones todavía no están disponibles.', 'configuration');
  }
  if (!response.ok) {
    throw new PushClientError(
      await readApiError(response, 'No pudimos preparar las notificaciones.'),
      'network',
    );
  }

  const payload = await response.json() as { publicKey?: unknown };
  if (typeof payload.publicKey !== 'string' || !payload.publicKey.trim()) {
    throw new PushClientError('Las notificaciones todavía no están configuradas.', 'configuration');
  }
  return payload.publicKey;
}

export function serializePushSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const serialized = subscription.toJSON();
  const endpoint = serialized.endpoint ?? subscription.endpoint;
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new PushClientError('El navegador devolvió una suscripción incompleta.', 'unsupported');
  }

  return {
    endpoint,
    expirationTime: serialized.expirationTime ?? subscription.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  let response: Response;

  try {
    response = await fetch(SUBSCRIPTIONS_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serializePushSubscription(subscription)),
    });
  } catch (error) {
    throw new PushClientError('No pudimos guardar la suscripción en este momento.', 'network', { cause: error });
  }

  if (response.status === 401) {
    throw new PushClientError('Tu sesión expiró. Inicia sesión nuevamente.', 'unauthorized');
  }
  if (!response.ok) {
    throw new PushClientError(
      await readApiError(response, 'No pudimos guardar la suscripción.'),
      response.status === 503 ? 'configuration' : 'network',
    );
  }
}

async function deleteSubscription(endpoint: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(SUBSCRIPTIONS_ENDPOINT, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch (error) {
    throw new PushClientError('No pudimos desactivar las notificaciones.', 'network', { cause: error });
  }

  if (response.status === 401) {
    throw new PushClientError('Tu sesión expiró. Inicia sesión nuevamente.', 'unauthorized');
  }
  if (!response.ok) {
    throw new PushClientError(
      await readApiError(response, 'No pudimos desactivar las notificaciones.'),
      'network',
    );
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const environment = getPushEnvironment();
  if (!environment.supported) {
    throw new PushClientError('Este navegador no admite notificaciones push.', 'unsupported');
  }

  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    return await navigator.serviceWorker.ready;
  } catch (error) {
    throw new PushClientError('No pudimos iniciar las notificaciones en este navegador.', 'unsupported', { cause: error });
  }
}

function sameApplicationServerKey(current: ArrayBuffer | null, expected: Uint8Array<ArrayBuffer>): boolean {
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  return currentBytes.length === expected.length
    && currentBytes.every((value, index) => value === expected[index]);
}

export async function syncExistingPushSubscription(): Promise<PushSubscription | null> {
  const environment = getPushEnvironment();
  if (!environment.supported || environment.permission !== 'granted') return null;

  const registration = await registerServiceWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;

  await saveSubscription(subscription);
  return subscription;
}

export async function enablePushNotifications(): Promise<PushSubscription> {
  const environment = getPushEnvironment();
  if (!environment.supported) {
    throw new PushClientError('Este navegador no admite notificaciones push.', 'unsupported');
  }
  if (environment.isIos && !environment.isStandalone) {
    throw new PushClientError(
      'En iPhone o iPad primero debes agregar SIS4S a la pantalla de inicio.',
      'ios-install-required',
    );
  }

  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushClientError('El permiso de notificaciones está bloqueado.', 'permission-denied');
  }

  const registration = await registerServiceWorker();
  const publicKey = urlBase64ToUint8Array(await fetchVapidPublicKey());
  let subscription = await registration.pushManager.getSubscription();

  if (subscription && !sameApplicationServerKey(subscription.options.applicationServerKey, publicKey)) {
    try {
      await deleteSubscription(subscription.endpoint);
    } catch {
      // La suscripción antigua dejará de funcionar al rotar la clave y el servidor la depurará.
    }
    await subscription.unsubscribe();
    subscription = null;
  }

  let createdNow = false;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      createdNow = true;
    } catch (error) {
      if (Notification.permission === 'denied') {
        throw new PushClientError('El permiso de notificaciones está bloqueado.', 'permission-denied', { cause: error });
      }
      throw new PushClientError('No pudimos crear la suscripción en este dispositivo.', 'network', { cause: error });
    }
  }

  try {
    await saveSubscription(subscription);
  } catch (error) {
    if (createdNow) await subscription.unsubscribe().catch(() => false);
    throw error;
  }

  return subscription;
}

export async function disablePushNotifications(): Promise<void> {
  const environment = getPushEnvironment();
  if (!environment.supported) return;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // Primero desvinculamos el endpoint del usuario; así no se envían avisos aunque
  // el navegador falle después al eliminar su copia local.
  await deleteSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
