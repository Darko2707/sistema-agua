import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insertValues: [] as Array<Record<string, unknown>>,
  updateValues: [] as Array<Record<string, unknown>>,
  selectLimitResults: [] as Array<Array<Record<string, unknown>>>,
  selectOrderResult: [] as Array<Record<string, unknown>>,
  requestInsertResults: [] as Array<Array<{ id: string }>>,
  claimResults: [] as Array<Array<{ id: string }>>,
  authorizedResults: [] as Array<Array<Record<string, unknown>>>,
  forUpdateCalls: 0,
  lockOrder: [] as string[],
  profileLockJoins: 0,
  deleteCalls: 0,
  hashAccountPassword: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/password', () => ({
  hashAccountPassword: mocks.hashAccountPassword,
}));

import {
  RepresentativePasswordResetService,
  hashRepresentativeResetCode,
} from '@/src/infrastructure/db/services/representative-password-reset.service';

const resident = {
  perfilId: '11111111-1111-4111-8111-111111111111',
  circuitoId: '22222222-2222-4222-8222-222222222222',
  userId: 'resident-user',
  edificio: '1',
  departamento: '2A',
  residenteNombre: 'Residente Uno',
  residenteEmail: 'residente@example.com',
  residenteRole: 'residente',
  circuitoNombre: 'Circuito Uno',
};

function makeSelectBuilder() {
  const ordered = {
    limit: async () => mocks.selectLimitResults.shift() ?? [],
    then: <TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
      onfulfilled?: ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(mocks.selectOrderResult).then(onfulfilled, onrejected),
  };
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => mocks.selectLimitResults.shift() ?? [],
    orderBy: () => ordered,
  };
  return builder;
}

function makeTransaction() {
  return {
    select: vi.fn((selection?: Record<string, unknown>) => {
      const lockKind = selection ? 'perfil' : 'challenge';
      const selectBuilder = {
        from: () => selectBuilder,
        innerJoin: () => {
          if (lockKind === 'perfil') mocks.profileLockJoins += 1;
          return selectBuilder;
        },
        where: () => selectBuilder,
        orderBy: () => selectBuilder,
        limit: () => selectBuilder,
        for: async () => {
          mocks.forUpdateCalls += 1;
          mocks.lockOrder.push(lockKind);
          return mocks.authorizedResults.shift() ?? [resident];
        },
      };
      return selectBuilder;
    }),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        mocks.updateValues.push(values);
        return {
          where: () => ({
            returning: async () => (
              'generatedAt' in values && values.generatedBy !== null
                ? mocks.claimResults.shift() ?? []
                : ('usedAt' in values || 'password' in values ? [{ id: 'updated-row' }] : [])
            ),
          }),
        };
      },
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        mocks.insertValues.push(values);
        return {
          onConflictDoNothing: () => ({
            returning: async () => mocks.requestInsertResults.shift() ?? [],
          }),
        };
      },
    })),
    delete: vi.fn(() => ({
      where: async () => {
        mocks.deleteCalls += 1;
      },
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertValues.length = 0;
  mocks.updateValues.length = 0;
  mocks.selectLimitResults.length = 0;
  mocks.selectOrderResult = [];
  mocks.requestInsertResults.length = 0;
  mocks.claimResults.length = 0;
  mocks.authorizedResults.length = 0;
  mocks.forUpdateCalls = 0;
  mocks.lockOrder.length = 0;
  mocks.profileLockJoins = 0;
  mocks.deleteCalls = 0;
  mocks.hashAccountPassword.mockResolvedValue('hashed-password');
  mocks.select.mockImplementation(makeSelectBuilder);
  mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof makeTransaction>) => unknown) => (
    callback(makeTransaction())
  ));
});

describe('RepresentativePasswordResetService request lifecycle', () => {
  it('ignora un correo inexistente sin crear escrituras observables', async () => {
    mocks.selectLimitResults.push([]);
    const service = new RepresentativePasswordResetService();

    await expect(service.requestForResident({ email: 'no-existe@example.com' })).resolves.toBeUndefined();

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveLength(0);
    expect(mocks.updateValues).toHaveLength(0);
  });

  it('mantiene idempotente una solicitud que ya esta pendiente', async () => {
    mocks.selectLimitResults.push([resident], [resident]);
    mocks.requestInsertResults.push([{ id: 'request-1' }], []);
    const service = new RepresentativePasswordResetService();

    await service.requestForResident({ email: ' Residente@Example.com ' });
    await service.requestForResident({ email: 'residente@example.com' });

    expect(mocks.insertValues.filter(value => value.accion === 'password_reset.solicitud_creada')).toHaveLength(1);
    expect(mocks.updateValues.filter(value => 'usedAt' in value)).toHaveLength(0);
  });

  it('permite consumir cada solicitud una sola vez aun con dos generaciones concurrentes', async () => {
    mocks.selectLimitResults.push([resident], [resident]);
    mocks.claimResults.push([{ id: 'request-1' }], []);
    const service = new RepresentativePasswordResetService();

    const results = await Promise.allSettled([
      service.generateForResident({ representanteId: 'representante-1', perfilId: resident.perfilId }),
      service.generateForResident({ representanteId: 'representante-1', perfilId: resident.perfilId }),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(mocks.insertValues.filter(value => 'codeHash' in value)).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { code: 'CONFLICT' },
    });
  });

  it('revalida el alcance bajo lock antes de consumir la solicitud', async () => {
    mocks.selectLimitResults.push([resident]);
    mocks.authorizedResults.push([]);
    mocks.claimResults.push([{ id: 'request-no-autorizada' }]);
    const service = new RepresentativePasswordResetService();

    await expect(service.generateForResident({
      representanteId: 'representante-reasignado',
      perfilId: resident.perfilId,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mocks.claimResults).toHaveLength(1);
    expect(mocks.insertValues).toHaveLength(0);
  });

  it('permite generar codigo para una cuenta operativa que tambien tiene perfil residente', async () => {
    mocks.selectLimitResults.push([{ ...resident, residenteRole: 'tesorera' }]);
    mocks.claimResults.push([{ id: 'request-tesorera' }]);
    const service = new RepresentativePasswordResetService();

    await expect(service.generateForResident({
      representanteId: 'representante-1',
      perfilId: resident.perfilId,
    })).resolves.toMatchObject({
      residente: {
        email: resident.residenteEmail,
      },
    });

    expect(mocks.insertValues.filter(value => 'codeHash' in value)).toHaveLength(1);
    expect(mocks.insertValues).toContainEqual(expect.objectContaining({
      accion: 'password_reset.codigo_generado',
      detalle: expect.objectContaining({ requestId: 'request-tesorera' }),
    }));
  });

  it('una nueva solicitud conserva el codigo vigente hasta que el representante genera el nuevo', async () => {
    mocks.selectLimitResults.push([resident], [resident], [resident]);
    mocks.claimResults.push([{ id: 'request-1' }], [{ id: 'request-2' }]);
    mocks.requestInsertResults.push([{ id: 'request-2' }]);
    const service = new RepresentativePasswordResetService();

    await service.generateForResident({ representanteId: 'representante-1', perfilId: resident.perfilId });
    await service.requestForResident({ email: resident.residenteEmail });
    expect(mocks.updateValues.filter(value => 'usedAt' in value)).toHaveLength(1);

    await service.generateForResident({ representanteId: 'representante-1', perfilId: resident.perfilId });

    expect(mocks.insertValues.filter(value => 'codeHash' in value)).toHaveLength(2);
    expect(mocks.updateValues.filter(value => 'usedAt' in value)).toHaveLength(2);
    expect(mocks.insertValues.filter(value => value.accion === 'password_reset.codigo_generado'))
      .toEqual([
        expect.objectContaining({ detalle: expect.objectContaining({ requestId: 'request-1' }) }),
        expect.objectContaining({ detalle: expect.objectContaining({ requestId: 'request-2' }) }),
      ]);
  });

  it('cierra una solicitud pendiente si el residente usa el codigo anterior', async () => {
    mocks.selectLimitResults.push(
      [{
        id: 'codigo-anterior',
        codeHash: hashRepresentativeResetCode('123456'),
        userId: resident.userId,
        perfilId: resident.perfilId,
        circuitoId: resident.circuitoId,
      }],
    );
    mocks.authorizedResults.push([{
      id: resident.perfilId,
      userId: resident.userId,
    }], [{
      id: 'codigo-anterior',
      userId: resident.userId,
      attempts: 0,
      codeHash: hashRepresentativeResetCode('123456'),
    }]);
    const service = new RepresentativePasswordResetService();

    await service.redeem({
      email: resident.residenteEmail,
      code: '123456',
      newPassword: 'nueva-clave-segura',
    });

    expect(mocks.updateValues).toContainEqual({
      generatedAt: expect.any(Date),
      generatedBy: null,
    });
    expect(mocks.insertValues).toContainEqual(expect.objectContaining({
      accion: 'password_reset.codigo_usado',
    }));
    expect(mocks.forUpdateCalls).toBe(2);
    expect(mocks.lockOrder).toEqual(['perfil', 'challenge']);
    expect(mocks.profileLockJoins).toBe(2);
    expect(mocks.hashAccountPassword).toHaveBeenCalledOnce();
  });

  it.each([
    'el usuario cambia a un rol privilegiado',
    'el circuito se vuelve inactivo',
    'el perfil cambia de usuario durante scrypt',
  ])('revalida alcance bajo el primer lock cuando %s', async () => {
    mocks.selectLimitResults.push([{
      id: 'codigo-preliminar',
      codeHash: hashRepresentativeResetCode('123456'),
      userId: resident.userId,
      perfilId: resident.perfilId,
      circuitoId: resident.circuitoId,
    }]);
    // El JOIN bloqueado perfil+user+circuito ya no satisface alguna de sus
    // condiciones autoritativas y por eso no devuelve fila.
    mocks.authorizedResults.push([]);
    const service = new RepresentativePasswordResetService();

    await expect(service.redeem({
      email: resident.residenteEmail,
      code: '123456',
      newPassword: 'nueva-clave-segura',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.hashAccountPassword).toHaveBeenCalledOnce();
    expect(mocks.lockOrder).toEqual(['perfil']);
    expect(mocks.profileLockJoins).toBe(2);
    expect(mocks.updateValues.some(value => 'password' in value)).toBe(false);
    expect(mocks.deleteCalls).toBe(0);
    expect(mocks.insertValues.some(value => value.accion === 'password_reset.codigo_usado')).toBe(false);
  });

  it('no consume una lectura obsoleta cuando el challenge bloqueado ya alcanzo cinco intentos', async () => {
    mocks.selectLimitResults.push(
      [{
        id: 'codigo-bloqueado',
        codeHash: hashRepresentativeResetCode('123456'),
        userId: resident.userId,
        perfilId: resident.perfilId,
        circuitoId: resident.circuitoId,
      }],
    );
    mocks.authorizedResults.push([{
      id: resident.perfilId,
      userId: resident.userId,
    }], [{
      id: 'codigo-bloqueado',
      userId: resident.userId,
      attempts: 5,
      codeHash: hashRepresentativeResetCode('123456'),
    }]);
    const service = new RepresentativePasswordResetService();

    await expect(service.redeem({
      email: resident.residenteEmail,
      code: '123456',
      newPassword: 'nueva-clave-segura',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.forUpdateCalls).toBe(2);
    expect(mocks.updateValues.some(value => 'password' in value)).toBe(false);
    expect(mocks.insertValues.some(value => value.accion === 'password_reset.codigo_usado')).toBe(false);
  });

  it('un codigo incorrecto incrementa bajo lock sin ejecutar scrypt', async () => {
    mocks.selectLimitResults.push(
      [{
        id: 'codigo-incorrecto',
        codeHash: hashRepresentativeResetCode('123456'),
        userId: resident.userId,
        perfilId: resident.perfilId,
        circuitoId: resident.circuitoId,
      }],
    );
    mocks.authorizedResults.push([{
      id: resident.perfilId,
      userId: resident.userId,
    }], [{
      id: 'codigo-incorrecto',
      userId: resident.userId,
      attempts: 2,
      codeHash: hashRepresentativeResetCode('123456'),
    }]);
    const service = new RepresentativePasswordResetService();

    await expect(service.redeem({
      email: resident.residenteEmail,
      code: '000000',
      newPassword: 'nueva-clave-segura',
    })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Codigo invalido o expirado',
    });

    expect(mocks.hashAccountPassword).not.toHaveBeenCalled();
    expect(mocks.forUpdateCalls).toBe(2);
    expect(mocks.updateValues).toContainEqual({ attempts: 3 });
  });

  it('un correo inexistente falla con el mismo mensaje y sin ejecutar scrypt', async () => {
    mocks.selectLimitResults.push([]);
    const service = new RepresentativePasswordResetService();

    await expect(service.redeem({
      email: 'no-existe@example.com',
      code: '000000',
      newPassword: 'nueva-clave-segura',
    })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Codigo invalido o expirado',
    });

    expect(mocks.hashAccountPassword).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('serializa intentos concurrentes y no incrementa por encima del maximo', async () => {
    mocks.selectLimitResults.push(
      [{
        id: 'codigo-concurrente',
        codeHash: hashRepresentativeResetCode('123456'),
        userId: resident.userId,
        perfilId: resident.perfilId,
        circuitoId: resident.circuitoId,
      }],
      [{
        id: 'codigo-concurrente',
        codeHash: hashRepresentativeResetCode('123456'),
        userId: resident.userId,
        perfilId: resident.perfilId,
        circuitoId: resident.circuitoId,
      }],
    );
    mocks.authorizedResults.push(
      [{ id: resident.perfilId, userId: resident.userId }],
      [{ id: resident.perfilId, userId: resident.userId }],
      [{
        id: 'codigo-concurrente',
        userId: resident.userId,
        attempts: 4,
        codeHash: hashRepresentativeResetCode('123456'),
      }],
      [{
        id: 'codigo-concurrente',
        userId: resident.userId,
        attempts: 5,
        codeHash: hashRepresentativeResetCode('123456'),
      }],
    );
    const service = new RepresentativePasswordResetService();

    const results = await Promise.allSettled([
      service.redeem({
        email: resident.residenteEmail,
        code: '000000',
        newPassword: 'nueva-clave-segura',
      }),
      service.redeem({
        email: resident.residenteEmail,
        code: '000000',
        newPassword: 'nueva-clave-segura',
      }),
    ]);

    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(mocks.forUpdateCalls).toBe(4);
    expect(mocks.updateValues.filter(value => value.attempts === 5)).toHaveLength(1);
    expect(mocks.updateValues.some(value => 'password' in value)).toBe(false);
    expect(mocks.hashAccountPassword).not.toHaveBeenCalled();
  });

  it('el listado protegido muestra solicitudes identificables sin exponer el codigo', async () => {
    const requestedAt = new Date('2026-08-14T12:00:00.000Z');
    mocks.selectOrderResult = [{
      perfilId: resident.perfilId,
      requestedAt,
      nombre: 'Residente Uno',
      email: resident.residenteEmail,
      edificio: '8',
      departamento: '314A',
      codeHash: 'no-debe-salir',
    }];
    const service = new RepresentativePasswordResetService();

    await expect(service.listPendingForRepresentative('representante-1')).resolves.toEqual([
      {
        perfilId: resident.perfilId,
        pendiente: true,
        requestedAt,
        nombre: 'Residente Uno',
        email: resident.residenteEmail,
        edificio: '8',
        departamento: '314A',
      },
    ]);
  });
});
