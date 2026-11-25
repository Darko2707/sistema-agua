import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  findPerfil: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    selectDistinct: mocks.select,
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {
    findById: mocks.findPerfil,
    findByEstado: vi.fn(),
    findByFraccionamientoYEstado: vi.fn(),
  },
}));

vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: vi.fn(),
}));

import { cortesRouter } from '@/server/routers/cortes';

const FRACCIONAMIENTO_A = '11111111-1111-4111-8111-111111111111';
const FRACCIONAMIENTO_B = '22222222-2222-4222-8222-222222222222';
const PERFIL_FRACC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERFIL_FRACC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const representanteContextA = {
  user: {
    id: 'rep-a',
    name: 'Representante Fracc A',
    email: 'rep.a@example.com',
    role: 'representante' as const,
    fraccionamientoId: FRACCIONAMIENTO_A,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  headers: new Headers(),
};

const adminContext = {
  user: {
    id: 'admin-1',
    name: 'Administrador Global',
    email: 'admin@example.com',
    role: 'admin' as const,
    fraccionamientoId: null,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  headers: new Headers(),
};

describe('HU-S4-04: Aislamiento multi-tenant en evidencias fotográficas de cuadrilla', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('representante de fraccionamiento A recibe NOT_FOUND (404) al consultar perfil de fraccionamiento B', async () => {
    // 1. roleProcedure middleware valida fraccionamiento activo
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([
            { id: FRACCIONAMIENTO_A, activo: true },
          ]),
        }),
      }),
    });

    // 2. Consulta del perfil solicitado: pertenece al fraccionamiento B
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([
            { id: PERFIL_FRACC_B, fraccionamientoId: FRACCIONAMIENTO_B },
          ]),
        }),
      }),
    });

    const caller = cortesRouter.createCaller(representanteContextA);

    await expect(
      caller.evidenciasFotograficas({ perfilId: PERFIL_FRACC_B }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('representante de fraccionamiento A consulta con éxito evidencias de su propio fraccionamiento', async () => {
    // 1. roleProcedure middleware valida fraccionamiento activo
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([
            { id: FRACCIONAMIENTO_A, activo: true },
          ]),
        }),
      }),
    });

    // 2. Consulta del perfil solicitado: pertenece al fraccionamiento A
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([
            { id: PERFIL_FRACC_A, fraccionamientoId: FRACCIONAMIENTO_A },
          ]),
        }),
      }),
    });

    // 3. Consulta bitacoraCortes
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValueOnce({
          leftJoin: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              orderBy: vi.fn().mockReturnValueOnce({
                limit: vi.fn().mockResolvedValueOnce([
                  {
                    id: 'bit-1',
                    corteId: 'corte-1',
                    perfilId: PERFIL_FRACC_A,
                    actorId: 'trabajador-1',
                    accion: 'corte_confirmado',
                    nota: 'Tubo cerrado con candado',
                    fotoUrl: 'uploads/trabajador-1/11111111-1111-4111-8111-111111111111.jpg',
                    creadoEn: new Date('2026-11-16T12:00:00Z'),
                    trabajadorNombre: 'Juan Cuadrilla',
                    edificio: '1',
                    departamento: '101',
                    fraccionamientoId: FRACCIONAMIENTO_A,
                  },
                ]),
              }),
            }),
          }),
        }),
      }),
    });

    // 4. Consulta evidenciasOrdenTrabajo
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValueOnce({
          innerJoin: vi.fn().mockReturnValueOnce({
            leftJoin: vi.fn().mockReturnValueOnce({
              where: vi.fn().mockReturnValueOnce({
                orderBy: vi.fn().mockReturnValueOnce({
                  limit: vi.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const caller = cortesRouter.createCaller(representanteContextA);
    const resultado = await caller.evidenciasFotograficas({ perfilId: PERFIL_FRACC_A });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      id: 'bit-1',
      tipo: 'corte',
      url: expect.stringContaining('/api/upload?ref='),
      referencia: 'uploads/trabajador-1/11111111-1111-4111-8111-111111111111.jpg',
      trabajador: {
        id: 'trabajador-1',
        nombre: 'Juan Cuadrilla',
      },
      vivienda: {
        perfilId: PERFIL_FRACC_A,
        edificio: '1',
        departamento: '101',
      },
      fraccionamientoId: FRACCIONAMIENTO_A,
    });
  });

  it('admin global puede consultar evidencias sin restricción de tenant', async () => {
    // Admin no tiene fraccionamientoId, por lo que roleProcedure no consulta fraccionamientos.
    // 1. Mock consulta bitacoraCortes
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValueOnce({
          leftJoin: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              orderBy: vi.fn().mockReturnValueOnce({
                limit: vi.fn().mockResolvedValueOnce([
                  {
                    id: 'bit-2',
                    corteId: 'corte-2',
                    perfilId: PERFIL_FRACC_B,
                    actorId: 'trabajador-2',
                    accion: 'reconexion_confirmada',
                    nota: null,
                    fotoUrl: 'uploads/trabajador-2/22222222-2222-4222-8222-222222222222.jpg',
                    creadoEn: new Date('2026-11-16T15:00:00Z'),
                    trabajadorNombre: 'Pedro Operativo',
                    edificio: '2',
                    departamento: '202',
                    fraccionamientoId: FRACCIONAMIENTO_B,
                  },
                ]),
              }),
            }),
          }),
        }),
      }),
    });

    // 2. Mock consulta evidenciasOrdenTrabajo
    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValueOnce({
          innerJoin: vi.fn().mockReturnValueOnce({
            leftJoin: vi.fn().mockReturnValueOnce({
              where: vi.fn().mockReturnValueOnce({
                orderBy: vi.fn().mockReturnValueOnce({
                  limit: vi.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const caller = cortesRouter.createCaller(adminContext);
    const resultado = await caller.evidenciasFotograficas({});

    expect(resultado).toHaveLength(1);
    expect(resultado[0].tipo).toBe('reconexion');
    expect(resultado[0].trabajador.nombre).toBe('Pedro Operativo');
    expect(resultado[0].vivienda.departamento).toBe('202');
  });
});
