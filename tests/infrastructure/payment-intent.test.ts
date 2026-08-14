import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertedValues: vi.fn(),
  insertReturning: vi.fn(),
  selectRows: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: (values: unknown) => {
        mocks.insertedValues(values);
        return {
          onConflictDoNothing: () => ({
            returning: mocks.insertReturning,
          }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: mocks.selectRows,
        }),
      }),
    })),
  },
}));

import {
  findMercadoPagoPaymentIntent,
  isMercadoPagoPaymentIntentReference,
  persistMercadoPagoPaymentIntent,
} from '@/src/infrastructure/mercadopago/payment-intent';

const REFERENCE = `agua_${'a'.repeat(48)}`;
const INPUT = {
  externalReference: REFERENCE,
  perfilId: '11111111-1111-4111-8111-111111111111',
  circuitoId: '22222222-2222-4222-8222-222222222222',
  periodos: [
    { mes: 8, anio: 2026, monto: '100.00', esReconexion: false },
  ],
  total: '120.91',
  collectorId: ' 98765 ',
  expiresAt: new Date('2026-08-09T18:20:00.000Z'),
};

function storedIntent(overrides: Record<string, unknown> = {}) {
  return {
    externalReference: REFERENCE,
    perfilId: INPUT.perfilId,
    circuitoId: INPUT.circuitoId,
    periodos: INPUT.periodos,
    total: INPUT.total,
    currency: 'MXN',
    collectorId: '98765',
    expiresAt: INPUT.expiresAt,
    mercadoPagoPaymentId: null,
    consumedAt: null,
    createdAt: new Date('2026-08-09T18:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertReturning.mockResolvedValue([storedIntent()]);
  mocks.selectRows.mockResolvedValue([]);
});

describe('intenciones de pago de Mercado Pago', () => {
  it('acepta solo la referencia opaca corta definida para nuevos checkouts', () => {
    expect(isMercadoPagoPaymentIntentReference(REFERENCE)).toBe(true);
    expect(REFERENCE).toHaveLength(53);
    expect(isMercadoPagoPaymentIntentReference(`agua_${'a'.repeat(49)}`)).toBe(false);
    expect(isMercadoPagoPaymentIntentReference('agua3|perfil|202608|0|100.00|0.00')).toBe(false);
  });

  it('persiste periodos y normaliza el collector sin exponerlos en la referencia', async () => {
    const result = await persistMercadoPagoPaymentIntent(INPUT);

    expect(result.externalReference).toBe(REFERENCE);
    expect(mocks.insertedValues).toHaveBeenCalledWith(expect.objectContaining({
      externalReference: REFERENCE,
      periodos: INPUT.periodos,
      total: '120.91',
      currency: 'MXN',
      collectorId: '98765',
    }));
  });

  it('rechaza una colision determinista si la fila existente describe otro cobro', async () => {
    mocks.insertReturning.mockResolvedValue([]);
    mocks.selectRows.mockResolvedValue([storedIntent({ total: '999.99' })]);

    await expect(persistMercadoPagoPaymentIntent(INPUT))
      .rejects.toThrow('Colision al persistir la intencion de pago');
  });

  it('reutiliza de forma idempotente una intencion identica ya persistida', async () => {
    mocks.insertReturning.mockResolvedValue([]);
    mocks.selectRows.mockResolvedValue([storedIntent()]);

    await expect(persistMercadoPagoPaymentIntent(INPUT))
      .resolves.toMatchObject({ externalReference: REFERENCE, total: '120.91' });
  });

  it('busca solo referencias opacas validas y devuelve null cuando no existen', async () => {
    await expect(findMercadoPagoPaymentIntent('agua3|perfil|202608|0|100.00|0.00'))
      .resolves.toBeNull();
    expect(mocks.selectRows).not.toHaveBeenCalled();

    mocks.selectRows.mockResolvedValueOnce([]);
    await expect(findMercadoPagoPaymentIntent(REFERENCE)).resolves.toBeNull();

    mocks.selectRows.mockResolvedValueOnce([storedIntent()]);
    await expect(findMercadoPagoPaymentIntent(REFERENCE))
      .resolves.toMatchObject({ externalReference: REFERENCE, currency: 'MXN' });
  });
});
