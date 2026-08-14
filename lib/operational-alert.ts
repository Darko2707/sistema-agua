import * as Sentry from '@sentry/nextjs';

import { logger } from '@/lib/logger';

const ALERT_THROTTLE_MS = 5 * 60 * 1000;
const lastAlertByFingerprint = new Map<string, number>();

type OperationalFailure = {
  component: 'rate_limit' | 'concurrency_guard';
  boundary: string;
  scope: string;
  error: unknown;
  failOpen: boolean;
};

/** Emits sanitized, grouped and locally throttled operational telemetry. */
export function reportOperationalFailure(input: OperationalFailure): void {
  const fingerprint = `${input.component}:${input.boundary}:${input.scope}`;
  const now = Date.now();
  const lastAlert = lastAlertByFingerprint.get(fingerprint) ?? 0;
  if (now - lastAlert < ALERT_THROTTLE_MS) return;
  lastAlertByFingerprint.set(fingerprint, now);

  const failureType = input.error instanceof Error ? input.error.name : typeof input.error;
  const event = `${input.component}.${input.boundary}.unavailable`;
  logger.error(event, undefined, {
    scope: input.scope,
    failureType,
    failOpen: input.failOpen,
  });

  Sentry.captureMessage(`${input.component} unavailable; request allowed`, {
    level: 'error',
    fingerprint: ['operational', input.component, input.boundary, input.scope],
    tags: {
      component: input.component,
      boundary: input.boundary,
      scope: input.scope,
      fail_open: String(input.failOpen),
    },
    extra: { failureType },
  });
}

export function resetOperationalAlertThrottleForTests(): void {
  if (process.env.NODE_ENV === 'test') lastAlertByFingerprint.clear();
}
