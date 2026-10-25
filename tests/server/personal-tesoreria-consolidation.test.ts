import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findFirstUser: vi.fn(),
  findFirstPerfil: vi.fn(),
  findFirstFracc: vi.fn(),
  updateUser: vi.fn(),
  updateFracc: vi.fn(),
  deleteSession: vi.fn(),
  insertAuditoria: vi.fn(),
  selectFracc: vi.fn(),
  updateCalls: [] as Array<{ table: string; values: Record<string, unknown>; whereClause?: unknown }>,
  insertAuditoriaCalls: [] as Array<Record<string, unknown>>,
  deleteSessionCalls: [] as Array<unknown>,
}));

vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
    query: {
      user: {
        findFirst: mocks.findFirstUser,
      },
      perfilesResidente: {
        findFirst: mocks.findFirstPerfil,
      },
      fraccionamientos: {
        findFirst: mocks.findFirstFracc,
      },
    },
    select: vi.fn(),
  },
}));

import { DrizzleUserRepository } from '@/src/infrastructure/db/repositories/drizzle-user.repository';
import { usuariosRouter } from '@/server/routers/usuarios';
import { user, fraccionamientos, session, auditoria } from '@/db/schema';

const FRACC_A = '11111111-1111-4111-8111-111111111111';
const FRACC_B = '22222222-2222-4222-8222-222222222222';
const USER_1 = 'user-001';
const USER_2 = 'user-002';
const ADMIN_ID = 'admin-999';

describe('Consolidación de Tesorería en Personal - DrizzleUserRepository', () => {
  let repo: DrizzleUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateCalls.length = 0;
    mocks.insertAuditoriaCalls.length = 0;
    mocks.deleteSessionCalls.length = 0;

    repo = new DrizzleUserRepository();

    // Mock tx implementation that simulates the transaction context
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn((table: unknown) => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn((whereClause: unknown) => {
              const tableName = table === user ? 'user' : table === fraccionamientos ? 'fraccionamientos' : 'unknown';
              mocks.updateCalls.push({ table: tableName, values, whereClause });
              return Promise.resolve();
            }),
          })),
        })),
        delete: vi.fn((table: unknown) => ({
          where: vi.fn((whereClause: unknown) => {
            if (table === session) {
              mocks.deleteSessionCalls.push(whereClause);
            }
            return Promise.resolve();
          }),
        })),
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((values: Record<string, unknown>) => {
            if (table === auditoria) {
              mocks.insertAuditoriaCalls.push(values);
            }
            return Promise.resolve();
          }),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: mocks.selectFracc,
            })),
          })),
        })),
      };
      return callback(tx);
    });
  });

  it('1. Promover a una persona a tesorera/o desde Personal actualiza rol, fraccionamiento, invalida sesiones y audita', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'residente',
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstPerfil.mockResolvedValueOnce({
      id: 'perfil-1',
      userId: USER_1,
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstFracc.mockResolvedValueOnce({
      id: FRACC_A,
      tesoreraId: null,
    });

    await repo.cambiarRol({
      userId: USER_1,
      nuevoRol: 'tesorera',
      actorId: ADMIN_ID,
    });

    // Debe haber actualizado el fraccionamiento con tesoreraId
    const fraccUpdate = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === USER_1,
    );
    expect(fraccUpdate).toBeDefined();

    // Debe haber actualizado el rol del usuario a tesorera
    const userUpdate = mocks.updateCalls.find(
      (c) => c.table === 'user' && c.values.role === 'tesorera',
    );
    expect(userUpdate).toBeDefined();
    expect(userUpdate?.values.fraccionamientoId).toBe(FRACC_A);

    // Debe haber invalidado la sesión de USER_1
    expect(mocks.deleteSessionCalls.length).toBeGreaterThanOrEqual(1);

    // Debe registrar en auditoria fraccionamiento.tesorera.asignada y usuario.rol.cambiado
    const auditAsignada = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'fraccionamiento.tesorera.asignada',
    );
    expect(auditAsignada).toBeDefined();
    expect(auditAsignada?.actorId).toBe(ADMIN_ID);
    expect(auditAsignada?.entidadId).toBe(FRACC_A);

    const auditRolCambiado = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'usuario.rol.cambiado',
    );
    expect(auditRolCambiado).toBeDefined();
    expect(auditRolCambiado?.actorId).toBe(ADMIN_ID);
    expect(auditRolCambiado?.entidadId).toBe(USER_1);
  });

  it('2. Sustituir a la tesorera actual degrada a la anterior a residente, invalida sus sesiones y audita el reemplazo', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_2,
      role: 'residente',
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstPerfil.mockResolvedValueOnce({
      id: 'perfil-2',
      userId: USER_2,
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstFracc.mockResolvedValueOnce({
      id: FRACC_A,
      tesoreraId: USER_1, // USER_1 es la tesorera anterior
    });

    await repo.cambiarRol({
      userId: USER_2,
      nuevoRol: 'tesorera',
      actorId: ADMIN_ID,
    });

    // Debe degradar a USER_1 a residente
    const anteriorUserUpdate = mocks.updateCalls.find(
      (c) => c.table === 'user' && c.values.role === 'residente',
    );
    expect(anteriorUserUpdate).toBeDefined();

    // Debe asignar a USER_2 como nueva tesorera en fraccionamiento
    const fraccUpdate = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === USER_2,
    );
    expect(fraccUpdate).toBeDefined();

    // Debe haber invalidado las sesiones de AMBOS usuarios
    expect(mocks.deleteSessionCalls.length).toBe(2);

    // Auditoría de reemplazo y de asignación
    const auditReemplazada = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'fraccionamiento.tesorera.reemplazada',
    );
    expect(auditReemplazada).toBeDefined();
    expect(auditReemplazada?.actorId).toBe(ADMIN_ID);
    expect((auditReemplazada?.detalle as Record<string, unknown>).anteriorTesoreraId).toBe(USER_1);
    expect((auditReemplazada?.detalle as Record<string, unknown>).nuevaTesoreraId).toBe(USER_2);

    const auditAsignada = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'fraccionamiento.tesorera.asignada',
    );
    expect(auditAsignada).toBeDefined();
  });

  it('3. Revocar el rol de tesorera a residente elimina tesoreraId en fraccionamiento, invalida sesiones y audita desasignación', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'tesorera',
      fraccionamientoId: FRACC_A,
    });

    await repo.cambiarRol({
      userId: USER_1,
      nuevoRol: 'residente',
      actorId: ADMIN_ID,
    });

    // Debe limpiar tesoreraId a null en fraccionamientos
    const fraccUpdate = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === null,
    );
    expect(fraccUpdate).toBeDefined();

    // Debe actualizar el usuario a residente
    const userUpdate = mocks.updateCalls.find(
      (c) => c.table === 'user' && c.values.role === 'residente',
    );
    expect(userUpdate).toBeDefined();

    // Debe invalidar la sesión
    expect(mocks.deleteSessionCalls.length).toBe(1);

    // Auditoría de desasignación
    const auditDesasignada = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'fraccionamiento.tesorera.desasignada',
    );
    expect(auditDesasignada).toBeDefined();
    expect(auditDesasignada?.actorId).toBe(ADMIN_ID);
    expect(auditDesasignada?.entidadId).toBe(FRACC_A);
  });

  it('4. Evita que un usuario sea tesorera de dos fraccionamientos distintos simultáneamente', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'tesorera',
      fraccionamientoId: FRACC_A,
    });
    // Perfil pertenece a FRACC_B
    mocks.findFirstPerfil.mockResolvedValueOnce({
      id: 'perfil-1',
      userId: USER_1,
      fraccionamientoId: FRACC_B,
    });
    mocks.findFirstFracc.mockResolvedValueOnce({
      id: FRACC_B,
      tesoreraId: null,
    });

    await repo.cambiarRol({
      userId: USER_1,
      nuevoRol: 'tesorera',
      actorId: ADMIN_ID,
    });

    // Debe haber limpiado tesoreraId en fraccionamientos donde no sea FRACC_B
    const cleanOtherFracc = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === null,
    );
    expect(cleanOtherFracc).toBeDefined();

    // Debe asignar en FRACC_B
    const assignFraccB = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === USER_1,
    );
    expect(assignFraccB).toBeDefined();
  });

  it('5. Atomicidad: Si una operación falla dentro de la transacción, el error se propaga para hacer rollback', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'residente',
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstPerfil.mockResolvedValueOnce({
      id: 'perfil-1',
      userId: USER_1,
      fraccionamientoId: FRACC_A,
    });
    mocks.findFirstFracc.mockResolvedValueOnce({
      id: FRACC_A,
      tesoreraId: null,
    });

    mocks.transaction.mockRejectedValueOnce(new Error('Simulated database deadlock / failure'));

    await expect(
      repo.cambiarRol({
        userId: USER_1,
        nuevoRol: 'tesorera',
        actorId: ADMIN_ID,
      }),
    ).rejects.toThrow('Simulated database deadlock / failure');
  });

  it('6. cambiarRolEnFraccionamiento: Representante revoca tesorera y limpia fraccionamiento.tesoreraId', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'tesorera',
      fraccionamientoId: FRACC_A,
    });

    await repo.cambiarRolEnFraccionamiento({
      userId: USER_1,
      nuevoRol: 'residente',
      fraccionamientoId: FRACC_A,
      actorId: 'rep-001',
    });

    const fraccClean = mocks.updateCalls.find(
      (c) => c.table === 'fraccionamientos' && c.values.tesoreraId === null,
    );
    expect(fraccClean).toBeDefined();

    const auditDesasignada = mocks.insertAuditoriaCalls.find(
      (a) => a.accion === 'fraccionamiento.tesorera.desasignada',
    );
    expect(auditDesasignada).toBeDefined();
    expect(auditDesasignada?.actorId).toBe('rep-001');
  });

  it('7. cambiarRolEnFraccionamiento: Rechaza si el usuario pertenece a otro fraccionamiento', async () => {
    mocks.findFirstUser.mockResolvedValueOnce({
      id: USER_1,
      role: 'residente',
      fraccionamientoId: FRACC_B, // Pertenece a B
    });

    await expect(
      repo.cambiarRolEnFraccionamiento({
        userId: USER_1,
        nuevoRol: 'tesorera',
        fraccionamientoId: FRACC_A, // Rep es de A
        actorId: 'rep-001',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Verificación de endpoints retirados y estructura de routers', () => {
  it('8. Los procedimientos usuarios.asignarTesorera y usuarios.listarTesoreras ya no existen en usuariosRouter', () => {
    const routerDef = usuariosRouter._def.procedures as Record<string, unknown>;
    expect(routerDef.asignarTesorera).toBeUndefined();
    expect(routerDef.listarTesoreras).toBeUndefined();
  });

  it('9. Los procedimientos autorizados para Personal y fraccionamientos permanecen activos', () => {
    const routerDef = usuariosRouter._def.procedures as Record<string, unknown>;
    expect(routerDef.cambiarRol).toBeDefined();
    expect(routerDef.cambiarRolEnFraccionamiento).toBeDefined();
    expect(routerDef.asignarCuentaSinCargos).toBeDefined();
    expect(routerDef.listarPersonal).toBeDefined();
  });
});

