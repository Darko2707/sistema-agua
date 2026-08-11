import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExecute,
  mockPaymentGet,
  mockSchedulePushDispatch,
  mockDecryptTokenSafe,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockPaymentGet: vi.fn(),
  mockSchedulePushDispatch: vi.fn(),
  mockDecryptTokenSafe: vi.fn(),
}));

vi.mock('@/src/application/pagos/commands/procesar-pago-mp.handler', () => ({
  ProcesarPagoMpHandler: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute = (...args: any[]) => mockExecute(...args);
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {}, pagoRepo: {}, circuitoRepo: {},
}));

vi.mock('@/db', () => ({
  db: {
    query: { perfilesResidente: { findFirst: vi.fn(async () => ({
      id: 'perfil-001',
      circuito: { mercadoPagoAccessToken: 'token-cifrado' },
    })) } },
  },
}));

vi.mock('@/lib/crypto', () => ({ decryptTokenSafe: mockDecryptTokenSafe }));
vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(() => ({
    paymentClient: { get: mockPaymentGet },
    preferenceClient: {},
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: mockSchedulePushDispatch,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { GET } from '@/app/api/mercadopago/return/route';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import * as Sentry from '@sentry/nextjs';

const REFERENCE = 'agua2|perfil-001|7|2025|12|0|100.00|0.00';

function request() {
  return new Request(
    `https://sistema-agua.vercel.app/api/mercadopago/return?payment_id=12345&ref=${encodeURIComponent(REFERENCE)}`,
  );
}

beforeEach(() => {
  mockDecryptTokenSafe.mockReturnValue('token-plano');
  mockPaymentGet.mockResolvedValue({
    id: 12345,
    status: 'approved',
    external_reference: REFERENCE,
    collector_id: 98765,
  });
  mockExecute.mockResolvedValue({ folio: 'AGU-001', folios: [], yaRegistrado: false });
});

afterEach(() => vi.clearAllMocks());

describe('GET /api/mercadopago/return', () => {
  it('procesa los doce meses en una sola operacion y despacha una vez', async () => {
    const response = await GET(request());

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=success');
    expect(mockExecute).toHaveBeenCalledOnce();
    expect(mockExecute.mock.calls[0][0].periodos).toHaveLength(12);
    expect(mockSchedulePushDispatch).toHaveBeenCalledOnce();
  });

  it('redirige a failure y alerta si los periodos pertenecen a otro paymentId', async () => {
    mockExecute.mockRejectedValue(new MercadoPagoPeriodConflictError('12345', [{
      mes: 7,
      anio: 2025,
      existingPaymentId: 'payment-anterior',
    }]));

    const response = await GET(request());

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=failure');
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
  });
});
