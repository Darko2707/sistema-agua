import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExecute,
  mockPaymentGet,
  mockSchedulePushDispatch,
  mockDecryptTokenSafe,
  mockFindPaymentIntent,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockPaymentGet: vi.fn(),
  mockSchedulePushDispatch: vi.fn(),
  mockDecryptTokenSafe: vi.fn(),
  mockFindPaymentIntent: vi.fn(),
}));

// These mocks prove the browser return route never reaches either write path.
vi.mock('@/src/application/pagos/commands/procesar-pago-mp.handler', () => ({
  ProcesarPagoMpHandler: class {
    execute = (...args: unknown[]) => mockExecute(...args);
  },
}));
vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: mockSchedulePushDispatch,
}));

vi.mock('@/db', () => ({
  db: {
    query: { perfilesResidente: { findFirst: vi.fn(async () => ({
      id: 'perfil-001',
      circuitoId: 'circuito-001',
      circuito: {
        id: 'circuito-001',
        montoMensual: '100.00',
        montoReconexion: '300.00',
        mercadoPagoAccessToken: 'token-cifrado',
        mercadoPagoCollectorId: '98765',
      },
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
vi.mock('@/src/infrastructure/mercadopago/payment-intent', () => ({
  isMercadoPagoPaymentIntentReference: (value: string) => /^agua_[a-f0-9]{48}$/.test(value),
  findMercadoPagoPaymentIntent: (...args: unknown[]) => mockFindPaymentIntent(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET } from '@/app/api/mercadopago/return/route';

const REFERENCE = 'agua2|perfil-001|7|2025|12|0|100.00|0.00';

function request(reference = REFERENCE) {
  return new Request(
    `https://sistema-agua.vercel.app/api/mercadopago/return?payment_id=12345&ref=${encodeURIComponent(reference)}`,
  );
}

beforeEach(() => {
  mockFindPaymentIntent.mockResolvedValue(null);
  mockDecryptTokenSafe.mockReturnValue('token-plano');
  mockPaymentGet.mockResolvedValue({
    id: 12345,
    status: 'approved',
    external_reference: REFERENCE,
    collector_id: 98765,
    currency_id: 'MXN',
    transaction_amount: 1399.84,
  });
});

afterEach(() => vi.clearAllMocks());

describe('GET /api/mercadopago/return', () => {
  it('solo verifica un pago aprobado y redirige a success sin acreditarlo', async () => {
    const response = await GET(request());

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=success');
    expect(mockPaymentGet).toHaveBeenCalledWith({ id: '12345' });
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
  });

  it('verifica una referencia opaca respaldada por su intencion sin escribir', async () => {
    const reference = `agua_${'b'.repeat(48)}`;
    mockFindPaymentIntent.mockResolvedValue({
      externalReference: reference,
      perfilId: 'perfil-001',
      circuitoId: 'circuito-001',
      periodos: [{ mes: 8, anio: 2026, monto: '100.00', esReconexion: false }],
      total: '120.91',
      currency: 'MXN',
      collectorId: '98765',
      expiresAt: new Date('2026-08-09T18:20:00.000Z'),
      mercadoPagoPaymentId: null,
      consumedAt: null,
      createdAt: new Date('2026-08-09T18:00:00.000Z'),
    });
    mockPaymentGet.mockResolvedValue({
      id: 12345,
      status: 'approved',
      external_reference: reference,
      collector_id: 98765,
      currency_id: 'MXN',
      transaction_amount: 120.91,
    });

    const response = await GET(request(reference));

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=success');
    expect(mockFindPaymentIntent).toHaveBeenCalledWith(reference);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
  });

  it('redirige a pending sin escribir cuando Mercado Pago sigue pendiente', async () => {
    mockPaymentGet.mockResolvedValue({
      id: 12345,
      status: 'pending',
      external_reference: REFERENCE,
      collector_id: 98765,
      currency_id: 'MXN',
      transaction_amount: 1399.84,
    });

    const response = await GET(request());

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=pending');
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['referencia', { external_reference: 'agua|otro-perfil|7|2025|0|100.00' }],
    ['importe', { transaction_amount: 1 }],
    ['moneda', { currency_id: 'USD' }],
    ['collector', { collector_id: 11111 }],
  ])('redirige a failure si no coincide %s', async (_label, override) => {
    mockPaymentGet.mockResolvedValue({
      id: 12345,
      status: 'approved',
      external_reference: REFERENCE,
      collector_id: 98765,
      currency_id: 'MXN',
      transaction_amount: 1399.84,
      ...override,
    });

    const response = await GET(request());

    expect(response.headers.get('location')).toBe('https://sistema-agua.vercel.app/residente?payment=failure');
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
  });
});
