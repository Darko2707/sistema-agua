import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  findOrdenes: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    query: {
      ordenesTrabajo: { findMany: mocks.findOrdenes },
    },
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {},
  circuitoRepo: {},
  userRepo: {},
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: vi.fn() },
}));

import { reportesRouter } from '@/server/routers/reportes';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const cuadrillaContext = {
  user: {
    id: 'cuadrilla-1',
    name: 'Cuadrilla',
    email: 'cuadrilla@example.com',
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    role: 'cuadrilla_cortes' as const,
    fraccionamientoId: TENANT_ID,
  },
  headers: new Headers(),
};

function assignmentChain(rows: Array<{ id: string }>) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue(assignmentChain([
    { id: 'asignacion-1' },
    { id: 'asignacion-2' },
  ]));
  mocks.findOrdenes.mockResolvedValue([{
    id: 'orden-1',
    tipo: 'corte',
    estado: 'pendiente',
    motivo: 'Adeudo',
    creadoEn: new Date('2026-09-01T12:00:00Z'),
    asignadoEn: null,
    iniciadoEn: null,
    completadoEn: null,
    canceladoEn: null,
    perfil: {
      id: 'perfil-1',
      usuario: { name: 'Residente' },
      edificio: '1',
      departamento: '101',
      estadoAgua: 'pendiente_corte',
    },
    fraccionamiento: { id: TENANT_ID, nombre: 'Fraccionamiento 1' },
    trabajador: null,
  }]);
});

describe('reportes.reporteOrdenesTrabajo para cuadrilla', () => {
  it('obtiene el alcance desde una asignación activa del fraccionamiento', async () => {
    const result = await reportesRouter.createCaller(cuadrillaContext).reporteOrdenesTrabajo({});

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.findOrdenes).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]?.fraccionamiento.id).toBe(TENANT_ID);
  });

  it('rechaza si no tiene una asignación operativa activa', async () => {
    mocks.select.mockReturnValue(assignmentChain([]));

    await expect(reportesRouter.createCaller(cuadrillaContext).reporteOrdenesTrabajo({}))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mocks.findOrdenes).not.toHaveBeenCalled();
  });
});
