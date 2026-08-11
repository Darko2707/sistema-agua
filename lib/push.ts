import 'server-only';

import { createHash } from 'node:crypto';
import webPush from 'web-push';

export type PushPayload = {
  title: string;
  body: string;
  url: '/residente' | '/residente/folios';
  tag: string;
};

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime: Date | null;
  p256dh: string;
  auth: string;
};

export type PushFailureKind = 'stale' | 'transient' | 'permanent' | 'configuration';

export class PushConfigurationError extends Error {
  constructor(message = 'Web Push no esta configurado') {
    super(message);
    this.name = 'PushConfigurationError';
  }
}

function readVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    throw new PushConfigurationError();
  }

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new PushConfigurationError('VAPID_SUBJECT debe usar mailto: o https://');
  }

  const base64Url = /^[A-Za-z0-9_-]+$/;
  const publicKeyBytes = base64Url.test(publicKey)
    ? Buffer.from(publicKey, 'base64url').length
    : 0;
  const privateKeyBytes = base64Url.test(privateKey)
    ? Buffer.from(privateKey, 'base64url').length
    : 0;
  if (publicKeyBytes !== 65 || privateKeyBytes !== 32) {
    throw new PushConfigurationError('Las llaves VAPID no tienen un formato valido');
  }

  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string {
  return readVapidConfig().publicKey;
}

export function classifyPushFailure(error: unknown): PushFailureKind {
  if (error instanceof PushConfigurationError) return 'configuration';

  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;

  if (statusCode === 404 || statusCode === 410) return 'stale';
  if (statusCode === 401 || statusCode === 403) return 'configuration';
  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) {
    return 'transient';
  }
  if (statusCode >= 400) return 'permanent';

  // Timeouts and transport failures do not carry an HTTP status.
  return 'transient';
}

export function pushFailureLabel(error: unknown): string {
  const kind = classifyPushFailure(error);
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  return statusCode ? `${kind}:${statusCode}` : kind;
}

export function pushRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('headers' in error)) return null;
  const headers = (error as { headers?: Record<string, unknown> }).headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 6 * 60 * 60 * 1_000);
  }

  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), 6 * 60 * 60 * 1_000);
}

function topicFor(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}

export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: PushPayload,
  dedupeKey: string,
): Promise<void> {
  const vapidDetails = readVapidConfig();

  await webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime?.getTime() ?? null,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
    {
      vapidDetails,
      TTL: 24 * 60 * 60,
      timeout: 10_000,
      urgency: 'high',
      topic: topicFor(dedupeKey),
    },
  );
}
