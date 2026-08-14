import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { error: mocks.loggerError } }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import {
  reportOperationalFailure,
  resetOperationalAlertThrottleForTests,
} from '@/lib/operational-alert';

describe('operational alert grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOperationalAlertThrottleForTests();
  });

  it('emite una sola alerta y un solo log por fingerprint durante el cooldown', () => {
    const input = {
      component: 'rate_limit' as const,
      boundary: 'trpc_route',
      scope: 'trpc_ip',
      error: new Error('detalle privado del proveedor'),
      failOpen: true,
    };
    reportOperationalFailure(input);
    reportOperationalFailure(input);

    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'rate_limit unavailable; request allowed',
      expect.objectContaining({
        fingerprint: ['operational', 'rate_limit', 'trpc_route', 'trpc_ip'],
      }),
    );
    expect(JSON.stringify(mocks.captureMessage.mock.calls)).not.toContain('detalle privado');
  });
});
