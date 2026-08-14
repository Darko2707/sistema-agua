import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  findPago: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  updateValues: [] as Array<Record<string, unknown>>,
  insertValues: [] as Array<Record<string, unknown>>,
  deleteCalls: 0,
  conditionalUpdateWins: true,
}));

vi.mock('@/db', () => ({
  db: { transaction: mocks.transaction },
}));

import { reversarPagoAtomico } from '@/src/infrastructure/db/services/drizzle-pago-reversal.service';

const pagoPagado = {
  id: '11111111-1111-4111-8111-111111111111',
  perfilId: '22222222-2222-4222-8222-222222222222',
  mes: 8,
  anio: 2026,
  estado: 'pagado' as const,
  folio: 'AGU-REVERSO-01',
  esReconexion: true,
  perfil: {
    userId: 'residente-001',
    estadoAgua: 'pendiente_reconexion' as const,
    circuito: {
      representanteId: 'representante-001',
      tesoreraId: 'tesorera-001',
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateValues.length = 0;
  mocks.insertValues.length = 0;
  mocks.deleteCalls = 0;
  mocks.conditionalUpdateWins = true;
  mocks.findPago.mockResolvedValue(pagoPagado);
  mocks.execute.mockResolvedValue(undefined);

  mocks.update.mockImplementation(() => ({
    set: (values: Record<string, unknown>) => {
      mocks.updateValues.push(values);
      return {
        where: () => {
          if ('estado' in values) {
            return {
              returning: async () => mocks.conditionalUpdateWins ? [{ id: pagoPagado.id }] : [],
            };
          }
          return Promise.resolve();
        },
      };
    },
  }));
  mocks.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      mocks.insertValues.push(values);
      return { onConflictDoNothing: async () => undefined };
    },
  }));
  mocks.delete.mockImplementation(() => ({
    where: async () => {
      mocks.deleteCalls += 1;
    },
  }));

  const tx = {
    execute: mocks.execute,
    query: { pagos: { findFirst: mocks.findPago } },
    update: mocks.update,
    insert: mocks.insert,
    delete: mocks.delete,
  };
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
});

describe('reversarPagoAtomico', () => {
  it('bloquea, revierte y audita dentro de una unica transaccion', async () => {
    const result = await reversarPagoAtomico({
      pagoId: pagoPagado.id,
      motivo: 'Pago aplicado por error operativo',
      actorId: 'representante-001',
      actorRole: 'representante',
    });

    expect(result).toEqual({ notificarReverso: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.updateValues).toContainEqual({ estado: 'vencido' });
    expect(mocks.updateValues).toContainEqual({ estadoAgua: 'cortado' });
    expect(mocks.deleteCalls).toBe(1);
    expect(mocks.insertValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ pagoId: pagoPagado.id, estadoAnterior: 'pagado' }),
      expect.objectContaining({ tipo: 'pago_reversado', dedupeKey: `pago_reversado:${pagoPagado.id}` }),
      expect.objectContaining({ accion: 'pago.reversado', entidadId: pagoPagado.id }),
    ]));
  });

  it('rechaza un segundo reverso al revalidar el estado bajo lock', async () => {
    mocks.findPago.mockResolvedValue({ ...pagoPagado, estado: 'vencido' });

    await expect(reversarPagoAtomico({
      pagoId: pagoPagado.id,
      motivo: 'Segundo intento concurrente de reverso',
      actorId: 'representante-001',
      actorRole: 'representante',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('detecta que otro escritor gano el update condicional', async () => {
    mocks.conditionalUpdateWins = false;

    await expect(reversarPagoAtomico({
      pagoId: pagoPagado.id,
      motivo: 'Reverso que perdio una carrera concurrente',
      actorId: 'tesorera-001',
      actorRole: 'tesorera',
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('revalida el alcance por circuito dentro de la transaccion', async () => {
    await expect(reversarPagoAtomico({
      pagoId: pagoPagado.id,
      motivo: 'Intento sobre un circuito ajeno',
      actorId: 'representante-ajeno',
      actorRole: 'representante',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
