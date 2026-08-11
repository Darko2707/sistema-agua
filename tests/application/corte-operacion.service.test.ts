import { describe, expect, it } from 'vitest';

import {
  CorteOperacionService,
  type CorteOperacionData,
  type CorteOperacionDatabase,
  type CorteOperacionTransaction,
  type PerfilCorteBloqueado,
} from '@/src/application/cortes/services/corte-operacion.service';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';

type BitacoraInput = Parameters<CorteOperacionTransaction['insertBitacora']>[0];
type AuditoriaInput = Parameters<CorteOperacionTransaction['insertAuditoria']>[0];
type FailurePoint =
  | 'createCorte'
  | 'closeCorte'
  | 'updateEstadoPerfil'
  | 'insertBitacora'
  | 'insertAuditoria'
  | 'insertPushNotification';

type FakeState = {
  perfil: PerfilCorteBloqueado | null;
  cortes: CorteOperacionData[];
  bitacora: Array<BitacoraInput & { id: string }>;
  auditoria: AuditoriaInput[];
  push: PushNotificationInput[];
};

function cloneState(state: FakeState): FakeState {
  return {
    perfil: state.perfil ? { ...state.perfil } : null,
    cortes: state.cortes.map((row) => ({ ...row })),
    bitacora: state.bitacora.map((row) => ({ ...row })),
    auditoria: state.auditoria.map((row) => ({ ...row })),
    push: state.push.map((row) => ({ ...row })),
  };
}

function pendingCutState(): FakeState {
  return {
    perfil: {
      id: 'perf-001',
      userId: 'user-001',
      estadoAgua: 'pendiente_corte',
    },
    cortes: [],
    bitacora: [],
    auditoria: [],
    push: [],
  };
}

function pendingReconnectionState(): FakeState {
  const state = pendingCutState();
  state.perfil!.estadoAgua = 'pendiente_reconexion';
  state.cortes.push({
    id: 'corte-activo',
    perfilId: 'perf-001',
    trabajadorId: 'trab-corte',
    motivo: 'falta_pago',
    activo: true,
    fechaCorte: new Date('2026-08-01T12:00:00.000Z'),
    fechaReconexion: null,
    reconectadoPor: null,
  });
  return state;
}

class FakeCorteOperacionDatabase implements CorteOperacionDatabase {
  state: FakeState;
  operations: string[] = [];
  failOn?: FailurePoint;

  private transactionTail = Promise.resolve();

  constructor(initialState: FakeState) {
    this.state = cloneState(initialState);
  }

  async transaction<T>(work: (tx: CorteOperacionTransaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const draft = cloneState(this.state);
    try {
      const result = await work(this.makeTransaction(draft));
      this.state = draft;
      return result;
    } finally {
      release();
    }
  }

  private makeTransaction(draft: FakeState): CorteOperacionTransaction {
    const record = (operation: string) => this.operations.push(operation);
    const fail = (point: FailurePoint) => {
      if (this.failOn === point) throw new Error(`fallo:${point}`);
    };

    return {
      lockPerfil: async (perfilId) => {
        record('lockPerfil');
        return draft.perfil?.id === perfilId ? { ...draft.perfil } : null;
      },

      createCorte: async (input) => {
        record('createCorte');
        fail('createCorte');
        const corte: CorteOperacionData = {
          id: `corte-${draft.cortes.length + 1}`,
          perfilId: input.perfilId,
          trabajadorId: input.trabajadorId,
          motivo: input.motivo,
          activo: true,
          fechaCorte: input.fecha,
          fechaReconexion: null,
          reconectadoPor: null,
        };
        draft.cortes.push(corte);
        return { ...corte };
      },

      lockCorteActivo: async (perfilId) => {
        record('lockCorteActivo');
        const corte = draft.cortes.find((row) => row.perfilId === perfilId && row.activo);
        return corte ? { ...corte } : null;
      },

      closeCorte: async (input) => {
        record('closeCorte');
        fail('closeCorte');
        const corte = draft.cortes.find((row) => row.id === input.corteId);
        if (!corte) throw new Error('corte inexistente');
        corte.activo = false;
        corte.fechaReconexion = input.fecha;
        corte.reconectadoPor = input.actorId;
      },

      updateEstadoPerfil: async (perfilId, estado) => {
        record('updateEstadoPerfil');
        fail('updateEstadoPerfil');
        if (!draft.perfil || draft.perfil.id !== perfilId) throw new Error('perfil inexistente');
        draft.perfil.estadoAgua = estado;
      },

      insertBitacora: async (input) => {
        record('insertBitacora');
        fail('insertBitacora');
        const row = { ...input, id: `bitacora-${draft.bitacora.length + 1}` };
        draft.bitacora.push(row);
        return { id: row.id };
      },

      insertAuditoria: async (input) => {
        record('insertAuditoria');
        fail('insertAuditoria');
        draft.auditoria.push({ ...input });
      },

      insertPushNotification: async (input) => {
        record('insertPushNotification');
        fail('insertPushNotification');
        draft.push.push({ ...input });
      },
    };
  }
}

const operationTime = new Date('2026-08-09T18:30:00.000Z');

describe('CorteOperacionService', () => {
  it('confirma el corte, su trazabilidad y un único outbox en una transacción', async () => {
    const database = new FakeCorteOperacionDatabase(pendingCutState());
    const service = new CorteOperacionService(database, () => operationTime);

    const result = await service.confirmarCorte({
      perfilId: 'perf-001',
      trabajadorId: 'trab-001',
    });

    expect(result.id).toBe('corte-1');
    expect(database.operations).toEqual([
      'lockPerfil',
      'createCorte',
      'updateEstadoPerfil',
      'insertBitacora',
      'insertAuditoria',
      'insertPushNotification',
    ]);
    expect(database.state.perfil?.estadoAgua).toBe('cortado');
    expect(database.state.cortes).toHaveLength(1);
    expect(database.state.bitacora).toEqual([
      expect.objectContaining({ corteId: 'corte-1', actorId: 'trab-001' }),
    ]);
    expect(database.state.auditoria).toEqual([
      expect.objectContaining({ entidadId: 'corte-1', actorId: 'trab-001' }),
    ]);
    expect(database.state.push).toEqual([
      expect.objectContaining({
        userId: 'user-001',
        tipo: 'corte_confirmado',
        dedupeKey: 'corte_confirmado:corte-1',
      }),
    ]);
  });

  it('serializa confirmaciones concurrentes y sólo una crea corte y outbox', async () => {
    const database = new FakeCorteOperacionDatabase(pendingCutState());
    const service = new CorteOperacionService(database, () => operationTime);

    const results = await Promise.allSettled([
      service.confirmarCorte({ perfilId: 'perf-001', trabajadorId: 'trab-001' }),
      service.confirmarCorte({ perfilId: 'perf-001', trabajadorId: 'trab-002' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find((result) => result.status === 'rejected');
    expect(rejection).toMatchObject({ reason: { code: 'BAD_REQUEST' } });
    expect(database.state.perfil?.estadoAgua).toBe('cortado');
    expect(database.state.cortes).toHaveLength(1);
    expect(database.state.bitacora).toHaveLength(1);
    expect(database.state.auditoria).toHaveLength(1);
    expect(database.state.push).toHaveLength(1);
    expect(database.state.push[0]?.dedupeKey).toBe('corte_confirmado:corte-1');
  });

  it('revierte corte, estado y trazabilidad si falla la inserción del outbox', async () => {
    const initialState = pendingCutState();
    const database = new FakeCorteOperacionDatabase(initialState);
    database.failOn = 'insertPushNotification';
    const service = new CorteOperacionService(database, () => operationTime);

    await expect(service.confirmarCorte({
      perfilId: 'perf-001',
      trabajadorId: 'trab-001',
    })).rejects.toThrow('fallo:insertPushNotification');

    expect(database.state).toEqual(initialState);
  });

  it('cierra el corte activo y usa el mismo identificador en toda la reconexión', async () => {
    const database = new FakeCorteOperacionDatabase(pendingReconnectionState());
    const service = new CorteOperacionService(database, () => operationTime);

    await expect(service.confirmarReconexion({
      perfilId: 'perf-001',
      actorId: 'trab-reconexion',
    })).resolves.toEqual({ ok: true, corteId: 'corte-activo' });

    expect(database.operations).toEqual([
      'lockPerfil',
      'lockCorteActivo',
      'closeCorte',
      'updateEstadoPerfil',
      'insertBitacora',
      'insertAuditoria',
      'insertPushNotification',
    ]);
    expect(database.state.perfil?.estadoAgua).toBe('activo');
    expect(database.state.cortes[0]).toMatchObject({
      activo: false,
      fechaReconexion: operationTime,
      reconectadoPor: 'trab-reconexion',
    });
    expect(database.state.bitacora[0]?.corteId).toBe('corte-activo');
    expect(database.state.auditoria[0]?.entidadId).toBe('corte-activo');
    expect(database.state.push[0]?.dedupeKey).toBe('reconexion_confirmada:corte-activo');
  });

  it('serializa reconexiones concurrentes y sólo una cierra y notifica', async () => {
    const database = new FakeCorteOperacionDatabase(pendingReconnectionState());
    const service = new CorteOperacionService(database, () => operationTime);

    const results = await Promise.allSettled([
      service.confirmarReconexion({ perfilId: 'perf-001', actorId: 'trab-001' }),
      service.confirmarReconexion({ perfilId: 'perf-001', actorId: 'trab-002' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'BAD_REQUEST' },
    });
    expect(database.state.cortes).toEqual([
      expect.objectContaining({ id: 'corte-activo', activo: false }),
    ]);
    expect(database.state.bitacora).toHaveLength(1);
    expect(database.state.auditoria).toHaveLength(1);
    expect(database.state.push).toHaveLength(1);
  });

  it('no activa el perfil si falta el corte activo que debe cerrar', async () => {
    const initialState = pendingCutState();
    initialState.perfil!.estadoAgua = 'cortado';
    const database = new FakeCorteOperacionDatabase(initialState);
    const service = new CorteOperacionService(database, () => operationTime);

    await expect(service.confirmarReconexion({
      perfilId: 'perf-001',
      actorId: 'trab-reconexion',
    })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });

    expect(database.state).toEqual(initialState);
    expect(database.operations).toEqual(['lockPerfil', 'lockCorteActivo']);
  });

  it('rechaza perfiles inexistentes o estados inválidos sin escrituras', async () => {
    const missingDatabase = new FakeCorteOperacionDatabase({
      ...pendingCutState(),
      perfil: null,
    });
    const missingService = new CorteOperacionService(missingDatabase, () => operationTime);
    await expect(missingService.confirmarCorte({
      perfilId: 'perf-001',
      trabajadorId: 'trab-001',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(missingDatabase.operations).toEqual(['lockPerfil']);

    const invalidState = pendingCutState();
    invalidState.perfil!.estadoAgua = 'activo';
    const invalidDatabase = new FakeCorteOperacionDatabase(invalidState);
    const invalidService = new CorteOperacionService(invalidDatabase, () => operationTime);
    await expect(invalidService.confirmarCorte({
      perfilId: 'perf-001',
      trabajadorId: 'trab-001',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(invalidDatabase.operations).toEqual(['lockPerfil']);
    expect(invalidDatabase.state).toEqual(invalidState);
  });
});
