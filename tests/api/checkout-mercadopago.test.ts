import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockFindByUserIdWithPaymentConfig,
  mockFindPagos,
  mockPreferenceCreate,
  mockDecryptTokenSafe,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindByUserIdWithPaymentConfig: vi.fn(),
  mockFindPagos: vi.fn(),
  mockPreferenceCreate: vi.fn(),
  mockDecryptTokenSafe: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: { findByUserIdWithPaymentConfig: mockFindByUserIdWithPaymentConfig },
}));

vi.mock('@/db', () => ({
  db: { query: { pagos: { findMany: mockFindPagos } } },
}));

vi.mock('@/lib/crypto', () => ({
  decryptTokenSafe: mockDecryptTokenSafe,
}));

vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(() => ({
    preferenceClient: { create: mockPreferenceCreate },
    paymentClient: {},
  })),
}));

import { POST } from '@/app/api/mercadopago/checkout/route';

const PERFIL = {
  id: 'perfil-001',
  userId: 'user-001',
  circuitoId: 'circuito-001',
  edificio: 'A',
  departamento: '101',
  estadoAgua: 'activo',
  creadoEn: null,
  circuito: {
    id: 'circuito-001',
    nombre: 'Circuito A',
    representanteId: 'representante-001',
    tesoreraId: null,
    montoMensual: '100.00',
    montoReconexion: '300.00',
    mercadoPagoAccessToken: 'token-cifrado',
    mercadoPagoCollectorId: 'collector-001',
    activo: true,
  },
};

function request(mesesAdelantados = 1) {
  return new Request('https://sistema-agua.vercel.app/api/mercadopago/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mesesAdelantados }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-09T18:01:00.000Z'));
  process.env.NEXT_PUBLIC_APP_URL = 'https://sistema-agua.vercel.app';
  mockGetSession.mockResolvedValue({
    user: { id: 'user-001', email: 'residente@example.com', name: 'Residente Uno' },
  });
  mockFindByUserIdWithPaymentConfig.mockResolvedValue(PERFIL);
  mockFindPagos.mockResolvedValue([]);
  mockDecryptTokenSafe.mockReturnValue('token-plano');
  mockPreferenceCreate.mockResolvedValue({ init_point: 'https://mercadopago.example/preference' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('POST /api/mercadopago/checkout', () => {
  it('reutiliza una idempotency key determinista y una expiracion estable en la misma ventana', async () => {
    const firstResponse = await POST(request(12));
    vi.setSystemTime(new Date('2026-08-09T18:08:59.000Z'));
    const secondResponse = await POST(request(12));

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mockPreferenceCreate).toHaveBeenCalledTimes(2);

    const first = mockPreferenceCreate.mock.calls[0][0];
    const second = mockPreferenceCreate.mock.calls[1][0];
    expect(first.requestOptions.idempotencyKey).toBe(second.requestOptions.idempotencyKey);
    expect(first.requestOptions.idempotencyKey).toMatch(/^agua-[a-f0-9]{40}$/);
    expect(first.body.expires).toBe(true);
    expect(first.body.expiration_date_to).toBe(second.body.expiration_date_to);
    expect(new Date(first.body.expiration_date_to).getTime())
      .toBeGreaterThan(new Date('2026-08-09T18:08:59.000Z').getTime());
  });

  it('cambia la idempotency key al cambiar periodos o cruzar la ventana segura', async () => {
    await POST(request(1));
    await POST(request(2));
    vi.setSystemTime(new Date('2026-08-09T18:11:00.000Z'));
    await POST(request(1));

    const keys = mockPreferenceCreate.mock.calls.map(call => call[0].requestOptions.idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it('salta periodos ya pagados y cobra los siguientes no pagados', async () => {
    mockFindPagos.mockResolvedValue([
      { mes: 8, anio: 2026 },
      { mes: 10, anio: 2026 },
    ]);

    const response = await POST(request(2));

    expect(response.status).toBe(200);
    const preference = mockPreferenceCreate.mock.calls[0][0];
    expect(preference.body.external_reference).toContain('agua3|perfil-001|202609,202611|0|100.00|0.00');
    expect(preference.body.items[0].description).toBe('2 meses desde 9/2026');
  });
});
