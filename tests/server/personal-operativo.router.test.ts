import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  requireOperational: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: {
    requireOperational: mocks.requireOperational,
  },
}));

vi.mock('@/src/application/acceso/verificar-acceso.service', () => ({
  VerificarAccesoService: class {
    execute = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {},
  circuitoRepo: {},
  userRepo: {},
}));

import { usuariosRouter } from '@/server/routers/usuarios';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const SERVICIO_ID = '33333333-3333-4333-8333-333333333333';
const ASIGNACION_ID = '44444444-4444-4444-8444-444444444444';

function buildCaller(role: 'admin' | 'residente' | 'cuadrilla_cortes', userId = 'user-test', fraccionamientoId = TENANT_A) {
  return usuariosRouter.createCaller({
    user: {
      id: userId,
      role,
      fraccionamientoId,
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    headers: new Headers(),
  });
}

function mockQueryChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  return chain;
}

describe('SCRUM-38: Personal Operativo — Asignaciones y Seguimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperational.mockResolvedValue(undefined);
  });

  it('permite a un admin asignar exitosamente un usuario cuadrilla_cortes a un servicio activo', async () => {
    // 1. Mock encontrar usuario: rol cuadrilla_cortes, mismo fraccionamiento
    mocks.select
      .mockReturnValueOnce(mockQueryChain([{ id: 'op-1', rol: 'cuadrilla_cortes', tenantId: TENANT_A }]))
      // 2. Mock encontrar servicio: activo en TENANT_A
      .mockReturnValueOnce(mockQueryChain([{ id: SERVICIO_ID }]));

    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: ASIGNACION_ID }]),
    };
    mocks.insert
      .mockReturnValueOnce(insertChain) // inserción de asignación
      .mockReturnValueOnce({ values: vi.fn().mockResolvedValue({}) }); // inserción de auditoría

    const caller = buildCaller('admin');
    const res = await caller.asignarPersonalOperativo({
      usuarioId: 'op-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    });

    expect(res).toEqual({ ok: true, id: ASIGNACION_ID });
    expect(mocks.requireOperational).toHaveBeenCalledWith(TENANT_A);
  });

  it('rechaza asignar si el rol del usuario no es cuadrilla_cortes', async () => {
    // El usuario en DB tiene rol "residente"
    mocks.select.mockReturnValueOnce(mockQueryChain([{ id: 'res-1', rol: 'residente', tenantId: TENANT_A }]));

    const caller = buildCaller('admin');
    await expect(caller.asignarPersonalOperativo({
      usuarioId: 'res-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'El rol del usuario no coincide con la asignación',
    });
  });

  it('rechaza asignar personal si pertenece a otro fraccionamiento (aislamiento multi-tenant)', async () => {
    // El usuario pertenece a TENANT_B pero se intenta asignar en TENANT_A
    mocks.select.mockReturnValueOnce(mockQueryChain([{ id: 'op-1', rol: 'cuadrilla_cortes', tenantId: TENANT_B }]));

    const caller = buildCaller('admin');
    await expect(caller.asignarPersonalOperativo({
      usuarioId: 'op-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'El usuario pertenece a otro fraccionamiento',
    });
  });

  it('rechaza asignar si el servicio no está activo en el fraccionamiento', async () => {
    mocks.select
      .mockReturnValueOnce(mockQueryChain([{ id: 'op-1', rol: 'cuadrilla_cortes', tenantId: TENANT_A }]))
      .mockReturnValueOnce(mockQueryChain([])); // No existe o no está activo

    const caller = buildCaller('admin');
    await expect(caller.asignarPersonalOperativo({
      usuarioId: 'op-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'El servicio no está activo en el fraccionamiento',
    });
  });

  it('permite a un admin retirar una asignación operativa y registra auditoría', async () => {
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: ASIGNACION_ID, fraccionamientoId: TENANT_A }]),
    };
    mocks.update.mockReturnValueOnce(updateChain);
    mocks.insert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue({}) });

    const caller = buildCaller('admin');
    const res = await caller.quitarAsignacionPersonal({ asignacionId: ASIGNACION_ID });

    expect(res).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1); // Auditoría registrada
  });

  it('rechaza a un usuario no administrador intentar asignar personal operativo', async () => {
    // Simular que el fraccionamiento del usuario está activo en protectedProcedure
    mocks.select.mockReturnValueOnce(mockQueryChain([{ activo: true }]));
    const callerResidente = buildCaller('residente');
    await expect(callerResidente.asignarPersonalOperativo({
      usuarioId: 'op-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    mocks.select.mockReturnValueOnce(mockQueryChain([{ activo: true }]));
    const callerCuadrilla = buildCaller('cuadrilla_cortes');
    await expect(callerCuadrilla.asignarPersonalOperativo({
      usuarioId: 'op-1',
      fraccionamientoId: TENANT_A,
      fraccionamientoServicioId: SERVICIO_ID,
      rol: 'cuadrilla_cortes',
    })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
