import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';

import {
  beforeSendServerEvent,
  resetServerEventThrottleForTests,
} from '@/instrumentation';

describe('Sentry noisy-event grouping', () => {
  beforeEach(() => resetServerEventThrottleForTests());

  it('agrupa y suprime firmas webhook repetidas durante el cooldown', () => {
    const first = beforeSendServerEvent({
      type: undefined,
      tags: { component: 'webhook', error_type: 'signature_invalid' },
    });
    const second = beforeSendServerEvent({
      type: undefined,
      tags: { component: 'webhook', error_type: 'signature_invalid' },
    });
    expect(first?.fingerprint).toEqual(['operational', 'webhook', 'signature_invalid']);
    expect(second).toBeNull();
  });

  it('no suprime errores inesperados de procesamiento', () => {
    const event: ErrorEvent = {
      type: undefined,
      tags: { component: 'webhook', error_type: 'processing_error' },
    };
    expect(beforeSendServerEvent(event)).toBe(event);
    expect(beforeSendServerEvent(event)).toBe(event);
  });

  it('agrupa pero conserva todos los conflictos financieros para conciliacion', () => {
    const first: ErrorEvent = {
      type: undefined,
      tags: { component: 'webhook', error_type: 'payment_intent_conflict' },
    };
    const second: ErrorEvent = {
      type: undefined,
      tags: { component: 'webhook', error_type: 'payment_intent_conflict' },
    };
    expect(beforeSendServerEvent(first)).toBe(first);
    expect(beforeSendServerEvent(second)).toBe(second);
    expect(first.fingerprint).toEqual(['operational', 'webhook', 'payment_intent_conflict']);
    expect(second.fingerprint).toEqual(['operational', 'webhook', 'payment_intent_conflict']);
  });
});
