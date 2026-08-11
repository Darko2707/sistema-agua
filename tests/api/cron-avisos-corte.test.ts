import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEncolar = vi.fn();
const mockDispatch = vi.fn();

vi.mock('@/src/infrastructure/db/jobs/encolar-proximos-corte', () => ({
  encolarProximosCorte: (...args: unknown[]) => mockEncolar(...args),
}));

vi.mock('@/lib/push-dispatcher', () => ({
  dispatchPendingPushNotifications: (...args: unknown[]) => mockDispatch(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET } from '@/app/api/cron/avisos-corte/route';

function request(authorization?: string) {
  return new Request('https://example.com/api/cron/avisos-corte', {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe('GET /api/cron/avisos-corte', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
    mockEncolar.mockResolvedValue({
      omitido: false,
      dia: 4,
      mes: 8,
      anio: 2026,
      candidatos: 600,
      encoladas: 600,
    });
    mockDispatch.mockResolvedValue({
      notificationsPrepared: 600,
      claimed: 600,
      delivered: 600,
      retrying: 0,
      failed: 0,
      staleSubscriptions: 0,
      configurationErrors: 0,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it('rechaza solicitudes sin el secreto del cron', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mockEncolar).not.toHaveBeenCalled();
  });

  it('encola y completa el despacho inmediato', async () => {
    const response = await GET(request('Bearer cron-test-secret'));
    expect(response.status).toBe(200);
    expect(mockEncolar).toHaveBeenCalledOnce();
    expect(mockDispatch).toHaveBeenCalledOnce();
  });

  it('no programa despacho cuando la deduplicacion no inserta filas', async () => {
    mockEncolar.mockResolvedValue({
      omitido: false,
      dia: 4,
      mes: 8,
      anio: 2026,
      candidatos: 600,
      encoladas: 0,
    });

    const response = await GET(request('Bearer cron-test-secret'));
    expect(response.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
