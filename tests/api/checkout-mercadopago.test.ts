import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSession,
  mockFindByUserIdWithPaymentConfig,
  mockFindPagos,
  mockPreferenceCreate,
  mockDecryptTokenSafe,
  mockPersistPaymentIntent,
  mockCheckoutAccountLimit,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindByUserIdWithPaymentConfig: vi.fn(),
  mockFindPagos: vi.fn(),
  mockPreferenceCreate: vi.fn(),
  mockDecryptTokenSafe: vi.fn(),
  mockPersistPaymentIntent: vi.fn(),
  mockCheckoutAccountLimit: vi.fn(),
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

vi.mock('@/src/infrastructure/mercadopago/payment-intent', () => ({
  persistMercadoPagoPaymentIntent: mockPersistPaymentIntent,
}));

vi.mock('@/lib/ratelimit', () => ({
  checkoutAccountLimiter: { limit: mockCheckoutAccountLimit },
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

const CASOS_MESES_TOTAL = [
  [1, '120.91'],
  [2, '237.18'],
  [3, '353.46'],
  [4, '469.71'],
  [5, '585.98'],
  [6, '702.25'],
  [7, '818.51'],
  [8, '934.77'],
  [9, '1051.04'],
  [10, '1167.30'],
  [11, '1283.58'],
  [12, '1399.84'],
] as const;

function periodoDesdeAgosto2026(offset: number) {
  const indice = 7 + offset;
  return {
    mes: (indice % 12) + 1,
    anio: 2026 + Math.floor(indice / 12),
  };
}

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
  mockPersistPaymentIntent.mockResolvedValue(undefined);
  mockCheckoutAccountLimit.mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60_000,
  });
  mockPreferenceCreate.mockResolvedValue({ init_point: 'https://mercadopago.example/preference' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('POST /api/mercadopago/checkout', () => {
  it('limita el checkout tambien por cuenta autenticada', async () => {
    mockCheckoutAccountLimit.mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await POST(request(1));

    expect(response.status).toBe(429);
    expect(mockCheckoutAccountLimit).toHaveBeenCalledWith(expect.stringMatching(/^account:[a-f0-9]{64}$/));
    expect(mockFindByUserIdWithPaymentConfig).not.toHaveBeenCalled();
    expect(mockPreferenceCreate).not.toHaveBeenCalled();
  });

  it.each(CASOS_MESES_TOTAL)(
    'crea y persiste correctamente un checkout de %i mes(es)',
    async (meses, totalEsperado) => {
      const response = await POST(request(meses));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        url: 'https://mercadopago.example/preference',
        desglose: { montoBase: `${meses * 100}.00`, total: totalEsperado },
      });

      expect(mockPersistPaymentIntent).toHaveBeenCalledOnce();
      const intent = mockPersistPaymentIntent.mock.calls[0][0];
      expect(intent.total).toBe(totalEsperado);
      expect(intent.periodos).toHaveLength(meses);
      expect(intent.periodos).toEqual(
        Array.from({ length: meses }, (_, offset) => ({
          ...periodoDesdeAgosto2026(offset),
          monto: '100.00',
          esReconexion: false,
        })),
      );

      const preference = mockPreferenceCreate.mock.calls[0][0];
      const reference = preference.body.external_reference as string;
      expect(reference).toMatch(/^agua_[a-f0-9]{48}$/);
      expect(reference.length).toBeLessThanOrEqual(64);
      expect(intent.externalReference).toBe(reference);
      expect(preference.body.items).toEqual([expect.objectContaining({
        id: reference,
        quantity: 1,
        currency_id: 'MXN',
        unit_price: Number(totalEsperado),
      })]);
    },
  );

  it.each([0, 13])('rechaza una cantidad fuera del rango 1..12: %i', async meses => {
    const response = await POST(request(meses));

    expect(response.status).toBe(400);
    expect(mockFindPagos).not.toHaveBeenCalled();
    expect(mockPersistPaymentIntent).not.toHaveBeenCalled();
    expect(mockPreferenceCreate).not.toHaveBeenCalled();
  });

  it('rechaza el checkout cuando el circuito esta inhabilitado', async () => {
    mockFindByUserIdWithPaymentConfig.mockResolvedValue({
      ...PERFIL,
      circuito: { ...PERFIL.circuito, activo: false },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Tu circuito esta inhabilitado' });
    expect(mockFindPagos).not.toHaveBeenCalled();
    expect(mockPersistPaymentIntent).not.toHaveBeenCalled();
    expect(mockPreferenceCreate).not.toHaveBeenCalled();
  });

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
    expect(preference.body.external_reference).toMatch(/^agua_[a-f0-9]{48}$/);
    expect(preference.body.external_reference).toHaveLength(53);
    expect(preference.body.items[0].id).toBe(preference.body.external_reference);
    expect(mockPersistPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      externalReference: preference.body.external_reference,
      perfilId: 'perfil-001',
      circuitoId: 'circuito-001',
      periodos: [
        { mes: 9, anio: 2026, monto: '100.00', esReconexion: false },
        { mes: 11, anio: 2026, monto: '100.00', esReconexion: false },
      ],
    }));
    expect(preference.body.items[0].description).toBe('2 meses desde 9/2026');
  });

  it('crea una referencia valida de Mercado Pago y conserva los doce periodos en la intencion', async () => {
    const response = await POST(request(12));

    expect(response.status).toBe(200);
    const preference = mockPreferenceCreate.mock.calls[0][0];
    const reference = preference.body.external_reference as string;
    expect(reference).toMatch(/^agua_[A-Za-z0-9_-]+$/);
    expect(reference.length).toBeLessThanOrEqual(64);
    expect(preference.body.items[0].id).toBe(reference);

    expect(mockPersistPaymentIntent).toHaveBeenCalledOnce();
    const intent = mockPersistPaymentIntent.mock.calls[0][0];
    expect(intent.externalReference).toBe(reference);
    expect(intent.total).toBe('1399.84');
    expect(intent.periodos).toHaveLength(12);
    expect(intent.periodos[0]).toEqual({
      mes: 8,
      anio: 2026,
      monto: '100.00',
      esReconexion: false,
    });
    expect(intent.periodos[11]).toEqual({
      mes: 7,
      anio: 2027,
      monto: '100.00',
      esReconexion: false,
    });
    expect(new Date(intent.expiresAt).toISOString()).toBe(preference.body.expiration_date_to);
  });
});
