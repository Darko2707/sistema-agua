import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  requireOperational: vi.fn(),
  userFindById: vi.fn(),
  userUpdateRoles: vi.fn(),
  residenteFindByUserId: vi.fn(),
  notasOperativasListar: vi.fn(),
  notasOperativasCrear: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    transaction: mocks.transaction,
    query: {
      servicios: { findMany: mocks.findMany },
      gastosFraccionamiento: { findMany: mocks.findMany },
      fraccionamientos: { findFirst: mocks.findFirst },
    },
  },
}));

vi.mock('@/src/infrastructure/db/services/subscription.service', () => ({
  subscriptionService: { requireOperational: mocks.requireOperational },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {
    findByUserId: mocks.residenteFindByUserId,
  },
  pagoRepo: {
    findFraccionamientoForCobroRepresentante: vi.fn(),
    findMetodoPagoMercadoPago: vi.fn(),
    findFoliosByPerfilUserId: vi.fn(),
  },
  userRepo: {
    findById: mocks.userFindById,
    updateRoles: mocks.userUpdateRoles,
  },
  circuitoRepo: {},
  donativoRepo: {},
  ticketRepo: {},
}));

vi.mock('@/src/infrastructure/db/repositories/drizzle-notas-operativas.repository', () => ({
  notasOperativasRepo: {
    listarPorFraccionamiento: mocks.notasOperativasListar,
    crear: mocks.notasOperativasCrear,
  },
}));

vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: vi.fn(),
}));

import { serviciosRouter } from '@/server/routers/servicios';
import { notasOperativasRouter } from '@/server/routers/notas-operativas';
import { reportesRouter } from '@/server/routers/reportes';
import { usuariosRouter } from '@/server/routers/usuarios';
import { pagosRouter } from '@/server/routers/pagos';

const FRACC_A = '11111111-1111-4111-8111-111111111111';
const FRACC_B = '22222222-2222-4222-8222-222222222222';
const USER_REP_A = 'rep-user-0001';
const USER_RESIDENTE = 'res-user-0001';

function buildContext(userOverrides: Partial<{
  id: string;
  role: 'admin' | 'representante' | 'tesorera' | 'residente' | 'cuadrilla_cortes' | 'operador_pozo';
  roles?: string[];
  fraccionamientoId: string | null;
}>) {
  return {
    user: {
      id: userOverrides.id ?? USER_REP_A,
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      role: userOverrides.role ?? ('representante' as const),
      roles: userOverrides.roles ?? [],
      fraccionamientoId: userOverrides.fraccionamientoId !== undefined ? userOverrides.fraccionamientoId : FRACC_A,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    headers: new Headers(),
  };
}

describe('Sprint 4 - Etapa B: Backend, Seguridad y Lógica de Negocio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperational.mockResolvedValue({ puedeOperar: true });
    // Default tenant check in roleProcedure: returns tenant activo: true
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ activo: true }]),
        }),
      }),
    });
  });

  describe('HU-S4-07: Servicios dinámicos con periodicidad', () => {
    it('representante crea servicio personalizado con periodicidad bimestral en su fraccionamiento', async () => {
      const caller = serviciosRouter.createCaller(buildContext({ role: 'representante', fraccionamientoId: FRACC_A }));

      const mockNuevoServicio = {
        id: 'serv-uuid-1',
        clave: 'jardineria_1234',
        nombre: 'Jardinería y áreas verdes',
        fraccionamientoId: FRACC_A,
        frecuenciaTipo: 'bimestral',
        intervaloPeriodicidad: 2,
        diaCobro: 15,
      };

      const mockActivacion = {
        id: 'fs-uuid-1',
        fraccionamientoId: FRACC_A,
        servicioId: 'serv-uuid-1',
        montoMensual: '150.00',
        montoReconexion: '50.00',
      };

      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValue([mockNuevoServicio]),
          }).mockReturnValueOnce({
            returning: vi.fn().mockResolvedValue([mockActivacion]),
          }).mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };

      mocks.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

      const res = await caller.crearServicioPersonalizado({
        nombre: 'Jardinería y áreas verdes',
        monto: 150,
        montoReconexion: 50,
        frecuenciaTipo: 'bimestral',
        intervaloPeriodicidad: 2,
        diaCobro: 15,
      });

      expect(res.ok).toBe(true);
      expect(res.servicio).toEqual(mockNuevoServicio);
    });

    it('representante recibe FORBIDDEN al intentar crear servicio para otro fraccionamiento', async () => {
      const caller = serviciosRouter.createCaller(buildContext({ role: 'representante', fraccionamientoId: FRACC_A }));

      await expect(caller.crearServicioPersonalizado({
        fraccionamientoId: FRACC_B,
        nombre: 'Intento Cross Tenant',
        monto: 100,
      })).rejects.toThrow(TRPCError);
    });

    it('representante recibe FORBIDDEN al consultar servicios de otro fraccionamiento', async () => {
      const caller = serviciosRouter.createCaller(buildContext({ role: 'representante', fraccionamientoId: FRACC_A }));

      await expect(caller.listarPersonalizados({
        fraccionamientoId: FRACC_B,
      })).rejects.toThrow(TRPCError);
    });

    it('representante recibe FORBIDDEN al editar servicio perteneciente a otro fraccionamiento', async () => {
      const caller = serviciosRouter.createCaller(buildContext({ role: 'representante', fraccionamientoId: FRACC_A }));

      // Mock select de servicioExistente
      mocks.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValue([{ id: 'serv-uuid-2', fraccionamientoId: FRACC_B }]),
          }),
        }),
      });

      await expect(caller.editarServicioPersonalizado({
        servicioId: 'serv-uuid-2',
        nombre: 'Nuevo Nombre',
      })).rejects.toThrow(TRPCError);
    });

    it('representante edita exitosamente un servicio de su propio fraccionamiento con nueva periodicidad y dia de cobro', async () => {
      const caller = serviciosRouter.createCaller(buildContext({ role: 'representante', fraccionamientoId: FRACC_A }));
      const VALID_SERV_ID = '33333333-3333-4333-8333-333333333333';

      mocks.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ activo: true, id: VALID_SERV_ID, fraccionamientoId: FRACC_A }]),
          }),
        }),
      });

      const mockServicioActualizado = {
        id: VALID_SERV_ID,
        nombre: 'Vigilancia 24/7',
        frecuenciaTipo: 'trimestral',
        intervaloPeriodicidad: 3,
        diaCobro: 10,
      };

      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockServicioActualizado]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };

      mocks.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

      const res = await caller.editarServicioPersonalizado({
        servicioId: VALID_SERV_ID,
        nombre: 'Vigilancia 24/7',
        monto: 300,
        frecuenciaTipo: 'trimestral',
        intervaloPeriodicidad: 3,
        diaCobro: 10,
      });

      expect(res.ok).toBe(true);
      expect(tx.update).toHaveBeenCalled();
    });
  });

  describe('HU-S4-08: Bloqueo de pagos a inquilinos', () => {
    it('bloquea a inquilino con 403 / FORBIDDEN al intentar registrar comprobante de transferencia', async () => {
      const caller = pagosRouter.createCaller(buildContext({
        id: USER_RESIDENTE,
        role: 'residente',
        fraccionamientoId: FRACC_A,
      }));

      mocks.residenteFindByUserId.mockResolvedValue({
        id: 'perfil-inquilino',
        userId: USER_RESIDENTE,
        fraccionamientoId: FRACC_A,
        tipoOcupante: 'inquilino',
        tenencia: 'inquilino',
      });

      await expect(caller.registrarComprobanteTransferencia({
        concepto: 'Pago cuota',
        monto: 250,
        comprobanteUrl: 'https://blob.vercel-storage.com/recibo.jpg',
      })).rejects.toThrow('Los inquilinos solo pueden consultar recibos; los pagos debe realizarlos el propietario.');
    });
  });

  describe('HU-S4-09: Multi-rol operativo', () => {
    it('guarda multiples roles operativos para un usuario a traves de asignarMultiplesRoles', async () => {
      const caller = usuariosRouter.createCaller(buildContext({ role: 'admin', fraccionamientoId: null }));
      mocks.userFindById.mockResolvedValue({ id: USER_REP_A, fraccionamientoId: FRACC_A });
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };
      mocks.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

      const result = await caller.asignarMultiplesRoles({
        userId: USER_REP_A,
        fraccionamientoId: FRACC_A,
        roles: ['representante', 'tesorera'],
      });

      expect(result.ok).toBe(true);
      expect(result.roles).toEqual(['representante', 'tesorera']);
      expect(tx.update).toHaveBeenCalled();
    });

    it('permite consultar misRoles y devuelve rol principal y array de roles operativos', async () => {
      const caller = usuariosRouter.createCaller(buildContext({
        id: USER_REP_A,
        role: 'representante',
        roles: ['representante', 'tesorera'],
        fraccionamientoId: FRACC_A,
      }));

      mocks.userFindById.mockResolvedValue({
        id: USER_REP_A,
        role: 'representante',
        roles: ['representante', 'tesorera'],
        fraccionamientoId: FRACC_A,
      });

      const res = await caller.misRoles();
      expect(res.rolPrincipal).toBe('representante');
      expect(res.roles).toEqual(['representante', 'tesorera']);
    });

    it('permite a un usuario con multi-rol ["representante", "tesorera"] ejecutar procedimientos de tesorera', async () => {
      // Caller has primary role 'representante' but has operational roles: ['representante', 'tesorera']
      const caller = reportesRouter.createCaller(buildContext({
        id: USER_REP_A,
        role: 'representante',
        roles: ['representante', 'tesorera'],
        fraccionamientoId: FRACC_A,
      }));

      mocks.findMany.mockResolvedValue([]);

      // listarGastos uses roleProcedure('tesorera')
      const res = await caller.listarGastos({
        categoria: 'insumos',
      });

      expect(res).toEqual([]);
    });
  });

  describe('HU-S4-10: Bitácora de notas operativas por rol', () => {
    it('bloquea a residente con FORBIDDEN al intentar crear una nota operativa', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        role: 'residente',
        fraccionamientoId: FRACC_A,
      }));

      await expect(caller.crear({
        contenido: 'Intento de nota por un residente',
      })).rejects.toThrow(TRPCError);
    });

    it('bloquea a residente con FORBIDDEN al intentar listar notas operativas', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        role: 'residente',
        fraccionamientoId: FRACC_A,
      }));

      await expect(caller.listar()).rejects.toThrow(TRPCError);
    });

    it('permite a representante crear nota operativa solo de rol por defecto registrando rolDestino', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        id: USER_REP_A,
        role: 'representante',
        fraccionamientoId: FRACC_A,
      }));

      const mockNotaCreada = {
        id: 'nota-1',
        fraccionamientoId: FRACC_A,
        autorId: USER_REP_A,
        rolAutor: 'Representante',
        rolDestino: 'representante',
        contenido: 'Mantenimiento preventivo en cisterna el próximo jueves.',
        createdAt: new Date(),
      };

      mocks.notasOperativasCrear.mockResolvedValue(mockNotaCreada);

      const res = await caller.crear({
        contenido: 'Mantenimiento preventivo en cisterna el próximo jueves.',
      });

      expect(res).toEqual(mockNotaCreada);
      expect(mocks.notasOperativasCrear).toHaveBeenCalledWith({
        fraccionamientoId: FRACC_A,
        autorId: USER_REP_A,
        rolAutor: 'Representante',
        rolDestino: 'representante',
        contenido: 'Mantenimiento preventivo en cisterna el próximo jueves.',
      });
    });

    it('permite crear nota global (rolDestino: null) desde cualquier rol operativo', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        id: 'user-cuadrilla-1',
        role: 'cuadrilla_cortes',
        fraccionamientoId: FRACC_A,
      }));

      const mockNotaGlobal = {
        id: 'nota-global-1',
        fraccionamientoId: FRACC_A,
        autorId: 'user-cuadrilla-1',
        rolAutor: 'Cuadrilla',
        rolDestino: null,
        contenido: 'Fuga general en válvula principal, corte temporal.',
        createdAt: new Date(),
      };

      mocks.notasOperativasCrear.mockResolvedValue(mockNotaGlobal);

      const res = await caller.crear({
        contenido: 'Fuga general en válvula principal, corte temporal.',
        alcance: 'global',
      });

      expect(res).toEqual(mockNotaGlobal);
      expect(mocks.notasOperativasCrear).toHaveBeenCalledWith({
        fraccionamientoId: FRACC_A,
        autorId: 'user-cuadrilla-1',
        rolAutor: 'Cuadrilla',
        rolDestino: null,
        contenido: 'Fuga general en válvula principal, corte temporal.',
      });
    });

    it('filtra las notas listadas según el rol del usuario o panelRol autorizado', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        id: 'user-multi-1',
        role: 'representante',
        roles: ['representante', 'tesorera'],
        fraccionamientoId: FRACC_A,
      }));

      mocks.notasOperativasListar.mockResolvedValue([]);

      await caller.listar({ panelRol: 'tesorera' });
      expect(mocks.notasOperativasListar).toHaveBeenCalledWith(FRACC_A, 'tesorera');

      await expect(caller.listar({ panelRol: 'cuadrilla_cortes' })).rejects.toThrow(TRPCError);
    });

    it('bloquea a representante que intenta crear o listar nota en otro fraccionamiento', async () => {
      const caller = notasOperativasRouter.createCaller(buildContext({
        role: 'representante',
        fraccionamientoId: FRACC_A,
      }));

      await expect(caller.crear({
        fraccionamientoId: FRACC_B,
        contenido: 'Intento cross tenant',
      })).rejects.toThrow(TRPCError);

      await expect(caller.listar({
        fraccionamientoId: FRACC_B,
      })).rejects.toThrow(TRPCError);
    });
  });

  describe('HU-S4-11: Tesorería sin ingresos extras y registro de insumos', () => {
    it('rechaza agregarIngreso con BAD_REQUEST indicando descontinuación', async () => {
      const caller = reportesRouter.createCaller(buildContext({
        role: 'tesorera',
        fraccionamientoId: FRACC_A,
      }));

      await expect(caller.agregarIngreso({
        concepto: 'Venta de chatarra',
        monto: 300,
      })).rejects.toThrow('Los ingresos adicionales han sido descontinuados en la tesorería');
    });

    it('listarGastos filtra por fraccionamiento y categoria insumos', async () => {
      const caller = reportesRouter.createCaller(buildContext({
        role: 'tesorera',
        fraccionamientoId: FRACC_A,
      }));

      const mockGastos = [
        {
          id: 'gasto-insumo-1',
          fraccionamientoId: FRACC_A,
          concepto: 'Compra de cloro y pastillas clarificadoras',
          monto: '450.00',
          categoria: 'insumos',
          fecha: new Date('2026-08-10'),
          anuladaEn: null,
        },
      ];

      mocks.findMany.mockResolvedValue(mockGastos);

      const res = await caller.listarGastos({
        categoria: 'insumos',
      });

      expect(res).toEqual(mockGastos);
    });

    it('bloquea a representante o tesorera que intenta listar gastos de otro fraccionamiento', async () => {
      const caller = reportesRouter.createCaller(buildContext({
        role: 'tesorera',
        fraccionamientoId: FRACC_A,
      }));

      await expect(caller.listarGastos({
        fraccionamientoId: FRACC_B,
      })).rejects.toThrow(TRPCError);
    });
  });
});
