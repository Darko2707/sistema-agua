import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPerfil: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: { findById: mocks.findPerfil },
  circuitoRepo: {},
  userRepo: {},
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: vi.fn() },
}));

vi.mock('@/src/infrastructure/db/services/drizzle-pago-reversal.service', () => ({
  reversarPagoAtomico: vi.fn(),
}));

vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: vi.fn(),
}));

import { operacionRouter } from '@/server/routers/operacion';

const PERFIL_ID = '11111111-1111-4111-8111-111111111111';
const CORTE_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';

const adminContext = {
  user: {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@example.com',
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    role: 'admin' as const,
    fraccionamientoId: null,
  },
  headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }),
};

const cuadrillaContext = {
  user: {
    ...adminContext.user,
    id: 'cuadrilla-1',
    email: 'cuadrilla@example.com',
    role: 'cuadrilla_cortes' as const,
    fraccionamientoId: TENANT_ID,
  },
  headers: new Headers({ 'x-forwarded-for': '203.0.113.11' }),
};

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue(selectChain([{ activo: true }]));
  mocks.findPerfil.mockResolvedValue({
    id: PERFIL_ID,
    fraccionamientoId: TENANT_ID,
  });
});

describe('operacion.agregarBitacoraCorte', () => {
  it('no permite fabricar confirmaciones fuera del servicio atomico de cortes', async () => {
    await expect(operacionRouter.createCaller(cuadrillaContext).agregarBitacoraCorte({
      perfilId: PERFIL_ID,
      corteId: CORTE_ID,
      accion: 'corte_confirmado' as 'nota',
      nota: 'Intento de confirmacion manual',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('revalida dentro de la transaccion la asignacion activa de la cuadrilla', async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{
          id: PERFIL_ID,
          fraccionamientoId: TENANT_ID,
          circuitoId: '55555555-5555-4555-8555-555555555555',
        }]))
        .mockReturnValueOnce(selectChain([])),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(operacionRouter.createCaller(cuadrillaContext).agregarBitacoraCorte({
      perfilId: PERFIL_ID,
      accion: 'nota',
      nota: 'Visita registrada',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rechaza dentro de la transaccion un corte que no pertenece al perfil', async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{ id: PERFIL_ID, fraccionamientoId: TENANT_ID }]))
        .mockReturnValueOnce(selectChain([])),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(operacionRouter.createCaller(adminContext).agregarBitacoraCorte({
      perfilId: PERFIL_ID,
      corteId: CORTE_ID,
      accion: 'nota',
      nota: 'Visita registrada',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('guarda bitacora y auditoria en la misma transaccion si perfil, tenant y corte coinciden', async () => {
    const bitacoraRow = {
      id: '44444444-4444-4444-8444-444444444444',
      perfilId: PERFIL_ID,
      corteId: CORTE_ID,
      accion: 'nota',
    };
    const returning = vi.fn().mockResolvedValue([bitacoraRow]);
    const bitacoraValues = vi.fn(() => ({ returning }));
    const auditoriaValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([{ id: PERFIL_ID, fraccionamientoId: TENANT_ID }]))
        .mockReturnValueOnce(selectChain([{
          id: CORTE_ID,
          perfilId: PERFIL_ID,
          fraccionamientoId: TENANT_ID,
        }])),
      insert: vi.fn()
        .mockReturnValueOnce({ values: bitacoraValues })
        .mockReturnValueOnce({ values: auditoriaValues }),
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    await expect(operacionRouter.createCaller(adminContext).agregarBitacoraCorte({
      perfilId: PERFIL_ID,
      corteId: CORTE_ID,
      accion: 'nota',
      nota: 'Visita registrada',
    })).resolves.toEqual(bitacoraRow);

    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(bitacoraValues).toHaveBeenCalledWith(expect.objectContaining({
      perfilId: PERFIL_ID,
      corteId: CORTE_ID,
    }));
    expect(auditoriaValues).toHaveBeenCalledWith(expect.objectContaining({
      entidadId: CORTE_ID,
      detalle: expect.objectContaining({ perfilId: PERFIL_ID }),
    }));
  });
});
