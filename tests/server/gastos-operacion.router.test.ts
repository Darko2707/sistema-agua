import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  tenant: vi.fn(),
  existingExpense: vi.fn(),
  insert: vi.fn(),
  requireOperational: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
    query: { fraccionamientos: { findFirst: mocks.tenant } },
  },
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: mocks.requireOperational },
}));

import { reportesRouter } from '@/server/routers/reportes';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const GASTO_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const expense = {
  id: GASTO_ID,
  fraccionamientoId: TENANT_ID,
  representanteId: 'tesorera-1',
  idempotencyKey: REQUEST_ID,
  concepto: 'Reparación de bomba',
  monto: '850.00',
  categoria: 'mantenimiento',
  referencia: 'FAC-2026-44',
  fecha: new Date('2026-04-12T00:00:00.000Z'),
  mes: 4,
  anio: 2026,
  creadoEn: new Date('2026-04-12T12:00:00.000Z'),
  anuladaEn: null,
};

const tesoreraContext = {
  user: {
    id: 'tesorera-1', name: 'Tesorera', email: 'tesorera@example.com', image: null,
    createdAt: new Date(), updatedAt: new Date(), role: 'tesorera' as const, fraccionamientoId: TENANT_ID,
  },
  headers: new Headers(),
};

function activeTenantChain() {
  const chain = { from: vi.fn(), where: vi.fn(), limit: vi.fn().mockResolvedValue([{ activo: true }]) };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue(activeTenantChain());
  mocks.tenant.mockResolvedValue({ id: TENANT_ID, tesoreraId: tesoreraContext.user.id, activo: true });
  mocks.requireOperational.mockResolvedValue({ puedeOperar: true });

  let firstInsert = true;
  const tx = {
    insert: vi.fn(() => {
      const isExpense = firstInsert;
      firstInsert = false;
      return {
        values: vi.fn(() => isExpense
          ? { onConflictDoNothing: () => ({ returning: async () => [expense] }) }
          : Promise.resolve()),
      };
    }),
    query: { gastosFraccionamiento: { findFirst: mocks.existingExpense } },
  };
  mocks.transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.existingExpense.mockResolvedValue(expense);
});

const newExpense = {
  concepto: 'Reparación de bomba', monto: 850, categoria: 'mantenimiento' as const,
  fecha: '2026-04-12', mes: 4, anio: 2026, referencia: 'FAC-2026-44', idempotencyKey: REQUEST_ID,
};

describe('reportes gastos de operación', () => {
  it('registra concepto libre, importe, fecha, referencia, tenant y autor', async () => {
    const created = await reportesRouter.createCaller(tesoreraContext).agregarGasto(newExpense);
    expect(created).toMatchObject({ id: GASTO_ID, fraccionamientoId: TENANT_ID, representanteId: tesoreraContext.user.id });
    expect(mocks.requireOperational).toHaveBeenCalledWith(TENANT_ID);
  });

  it('rechaza importes inválidos y fechas fuera del periodo', async () => {
    const caller = reportesRouter.createCaller(tesoreraContext);
    await expect(caller.agregarGasto({ ...newExpense, monto: Number.POSITIVE_INFINITY })).rejects.toBeDefined();
    await expect(caller.agregarGasto({ ...newExpense, fecha: '2026-05-12' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rechaza a roles no autorizados', async () => {
    const caller = reportesRouter.createCaller({
      ...tesoreraContext,
      user: { ...tesoreraContext.user, role: 'representante' as const },
    });
    await expect(caller.agregarGasto(newExpense)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('no permite modificar un gasto que no pertenece al fraccionamiento de sesión', async () => {
    mocks.existingExpense.mockResolvedValue(null);
    await expect(reportesRouter.createCaller(tesoreraContext).editarGasto({ id: GASTO_ID, concepto: 'Alteración' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('devuelve el mismo registro ante el reenvío de una solicitud idempotente', async () => {
    let duplicateInsert = false;
    let expenseInsertCount = 0;
    mocks.transaction.mockImplementation(async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      insert: vi.fn(() => {
        const isExpense = expenseInsertCount++ === 0;
        return { values: vi.fn(() => isExpense
          ? { onConflictDoNothing: () => ({ returning: async () => duplicateInsert ? [] : [expense] }) }
          : Promise.resolve()) };
      }),
      query: { gastosFraccionamiento: { findFirst: mocks.existingExpense } },
    }));
    const caller = reportesRouter.createCaller(tesoreraContext);
    const first = await caller.agregarGasto(newExpense);
    duplicateInsert = true;
    expenseInsertCount = 0;
    const retried = await caller.agregarGasto(newExpense);
    expect(retried.id).toBe(first.id);
  });
});
