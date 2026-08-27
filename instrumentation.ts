import type { Instrumentation } from 'next';
import type { ErrorEvent } from '@sentry/nextjs';
import { sentryEnvironment } from '@/lib/sentry-config';

const GROUPED_OPERATIONAL_EVENTS = new Set([
  'webhook:misconfigured',
  'webhook:signature_invalid',
  'webhook:payment_validation_failed',
  'webhook:payment_period_conflict',
  'webhook:payment_intent_conflict',
  'push:configuration',
]);
const THROTTLED_NOISE_EVENTS = new Set([
  'webhook:signature_invalid',
  'push:configuration',
]);
const noisyEventLastSentAt = new Map<string, number>();
const NOISY_EVENT_COOLDOWN_MS = 5 * 60 * 1000;

/** Groups and throttles only expected repetitive events; unknown errors remain intact. */
export function beforeSendServerEvent(event: ErrorEvent): ErrorEvent | null {
  const component = String(event.tags?.component ?? '');
  const errorType = String(event.tags?.error_type ?? '');
  const key = `${component}:${errorType}`;
  if (!GROUPED_OPERATIONAL_EVENTS.has(key)) return event;

  event.fingerprint = ['operational', component, errorType];
  // Financial conflicts/validation failures and fatal misconfiguration retain
  // every event for reconciliation. Only attacker-amplifiable signature noise
  // and repeated push configuration noise are sampled per warm instance.
  if (!THROTTLED_NOISE_EVENTS.has(key)) return event;
  const now = Date.now();
  const lastSentAt = noisyEventLastSentAt.get(key) ?? 0;
  if (now - lastSentAt < NOISY_EVENT_COOLDOWN_MS) return null;
  noisyEventLastSentAt.set(key, now);
  return event;
}

export function resetServerEventThrottleForTests(): void {
  if (process.env.NODE_ENV === 'test') noisyEventLastSentAt.clear();
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn:              process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment:      sentryEnvironment(),
      enabled:          !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug:            process.env.NODE_ENV !== 'production',
      beforeSend:       beforeSendServerEvent,
    });
  }
}

// Captures every server-side error: Route Handlers, Server Components, Server Actions, Proxy.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(err, request, context);
};
