import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbInsert: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  decryptToken: vi.fn(),
  findIntent: vi.fn(),
  paymentGet: vi.fn(),
  txExecute: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txSelect: vi.fn(),
  txSet: vi.fn(),
  txUpdate: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: mocks.dbInsert,
    select: mocks.dbSelect,
    transaction: mocks.dbTransaction,
  },
}));

vi.mock('@/lib/crypto', () => ({
  decryptTokenSafe: mocks.decryptToken,
}));

vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(() => ({
    paymentClient: { get: mocks.paymentGet },
  })),
}));

vi.mock('@/src/infrastructure/mercadopago/payment-intent', () => ({
  findMercadoPagoPaymentIntent: mocks.findIntent,
}));

import { processServiceCargoPayment } from '@/src/infrastructure/mercadopago/service-cargo-payment';

const CARGO_ID = '11111111-1111-4111-8111-111111111111';
const PERFIL_ID = '22222222-2222-4222-8222-222222222222';
const CIRCUITO_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const PAYMENT_ID = '987654321098765';
const REFERENCE = `serv_${CARGO_ID}`;

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbSelect.mockReturnValue(selectChain([{
    cargo: {
      id: CARGO_ID,
      perfilId: PERFIL_ID,
      fraccionamientoId: TENANT_ID,
      mes: 9,
      anio: 2026,
      monto: '250.00',
      estado: 'pendiente',
      mercadoPagoPaymentId: null,
    },
    perfil: { id: PERFIL_ID, circuitoId: CIRCUITO_ID },
    circuito: {
      id: CIRCUITO_ID,
      representanteId: 'representante-1',
      mercadoPagoAccessToken: 'token-cifrado',
    },
    servicio: 'drenaje',
    accessToken: 'token-cifrado',
    collectorId: null,
  }]));
  mocks.findIntent.mockResolvedValue(null);
  mocks.decryptToken.mockReturnValue('token-descifrado');
  mocks.paymentGet.mockResolvedValue({
    id: PAYMENT_ID,
    external_reference: REFERENCE,
    status: 'approved',
    currency_id: 'MXN',
    transaction_amount: 250,
  });

  mocks.txSelect.mockReturnValue(selectChain([]));
  const returning = vi.fn().mockResolvedValue([{ id: CARGO_ID }]);
  const where = vi.fn(() => ({ returning }));
  mocks.txSet.mockReturnValue({ where });
  mocks.txUpdate.mockReturnValue({ set: mocks.txSet });
  mocks.txInsertValues.mockResolvedValue(undefined);
  mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues });
  mocks.dbTransaction.mockImplementation(async (callback) => callback({
    execute: mocks.txExecute,
    insert: mocks.txInsert,
    select: mocks.txSelect,
    update: mocks.txUpdate,
  }));
});

describe('processServiceCargoPayment', () => {
  it('usa un folio publico opaco que no contiene el paymentId de Mercado Pago', async () => {
    await expect(processServiceCargoPayment({
      reference: REFERENCE,
      paymentId: PAYMENT_ID,
    })).resolves.toEqual({ alreadyProcessed: false });

    const cargoUpdate = mocks.txSet.mock.calls[0]?.[0];
    const ticket = mocks.txInsertValues.mock.calls
      .map(([value]) => value)
      .find((value) => value?.tipo === 'servicio');

    expect(cargoUpdate.folio).toMatch(/^SRV-[A-Z0-9]{20}$/);
    expect(cargoUpdate.folio).not.toContain(PAYMENT_ID);
    expect(ticket).toMatchObject({
      cargoServicioId: CARGO_ID,
      folio: cargoUpdate.folio,
      tipo: 'servicio',
    });
  });
});
