import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  findManyPagos: vi.fn(),
  findPago: vi.fn(),
  findPerfil: vi.fn(),
  findPaymentIntent: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  insertedPagos: [] as unknown[],
  insertedTickets: [] as unknown[],
  insertedOutbox: [] as unknown[],
  insertedAudits: [] as unknown[],
  updateValues: [] as unknown[],
}));

vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
    query: {
      pagos: { findFirst: mocks.findPago, findMany: vi.fn() },
      cortes: { findFirst: vi.fn() },
    },
  },
}));

import { DrizzlePagoRepository } from '@/src/infrastructure/db/repositories/drizzle-pago.repository';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import type {
  CrearPagoInput,
  CrearPagosManualBatchInput,
  CrearPagosMercadoPagoBatchInput,
  PagoData,
} from '@/src/application/ports/pago.repository';

function pagoInput(mes: number, anio = 2026): CrearPagoInput {
  return {
    perfilId: 'perfil-001',
    circuitoId: 'circuito-001',
    representanteId: 'representante-001',
    mes,
    anio,
    monto: '104.85',
    montoBase: '100.00',
    iva: '0.00',
    comisionMercadoPago: '4.85',
    retencionIsr: '0.00',
    retencionIva: '0.00',
    montoNetoRepresentante: '95.15',
    mercadoPagoPaymentId: 'payment-001',
    mercadoPagoCollectorId: 'collector-001',
    estado: 'pagado',
    metodo: 'mercado_pago',
    folio: `AGU-${String(mes).padStart(2, '0')}`,
    esReconexion: false,
    fechaPago: new Date('2026-08-09T18:00:00Z'),
  };
}

function persistedPago(input: CrearPagoInput, index: number): PagoData {
  return {
    ...input,
    id: `pago-${index}`,
    mercadoPagoPaymentId: input.mercadoPagoPaymentId ?? null,
    mercadoPagoCollectorId: input.mercadoPagoCollectorId ?? null,
    creadoEn: new Date('2026-08-09T18:00:00Z'),
  };
}

function batch(pagos = Array.from({ length: 12 }, (_, index) => pagoInput(index + 1))): CrearPagosMercadoPagoBatchInput {
  return {
    perfilId: 'perfil-001',
    circuitoId: 'circuito-001',
    mercadoPagoPaymentId: 'payment-001',
    pagos,
    pushNotification: {
      userId: 'user-001',
      perfilId: 'perfil-001',
      tipo: 'pago_confirmado',
      mensaje: 'Pago confirmado',
      dedupeKey: 'pago_confirmado:mp:payment-001:perfil-001',
    },
  };
}

function manualPagoInput(mes: number, anio = 2026): CrearPagoInput {
  return {
    ...pagoInput(mes, anio),
    metodo: 'efectivo',
    mercadoPagoPaymentId: undefined,
    mercadoPagoCollectorId: null,
    folio: `AGU-MANUAL-${anio}-${String(mes).padStart(2, '0')}`,
  };
}

function periodoConOffset(mes: number, anio: number, offset: number) {
  const indice = mes - 1 + offset;
  return {
    mes: (indice % 12) + 1,
    anio: anio + Math.floor(indice / 12),
  };
}

function pagosDesdePeriodo(
  cantidad: number,
  inicio: { mes: number; anio: number },
): CrearPagoInput[] {
  return Array.from({ length: cantidad }, (_, offset) => {
    const periodo = periodoConOffset(inicio.mes, inicio.anio, offset);
    return manualPagoInput(periodo.mes, periodo.anio);
  });
}

function manualBatch(
  pagos: CrearPagoInput[],
  politica: CrearPagosManualBatchInput['politica'] = { tipo: 'tesorera_escalonada' },
): CrearPagosManualBatchInput {
  const esTesorera = politica.tipo === 'tesorera_escalonada';
  return {
    perfilId: 'perfil-001',
    pagos,
    politica,
    actualizarEstadoAgua: esTesorera,
    pushNotification: {
      userId: 'user-001',
      perfilId: 'perfil-001',
      tipo: 'pago_confirmado',
      mensaje: 'Pago confirmado',
      dedupeKey: 'pago_confirmado:lote:manual-001',
    },
    auditoria: {
      actorId: esTesorera ? 'tesorera-001' : 'admin-001',
      accion: esTesorera ? 'pago.manual.tesorera' : 'pago.retroactivo.admin',
      metodo: 'efectivo',
    },
  };
}

const PAYMENT_INTENT_REFERENCE = `agua_${'a'.repeat(48)}`;

function paymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    externalReference: PAYMENT_INTENT_REFERENCE,
    perfilId: 'perfil-001',
    circuitoId: 'circuito-001',
    periodos: [{ mes: 4, anio: 2026, monto: '100.00', esReconexion: false }],
    total: '104.85',
    currency: 'MXN',
    collectorId: 'collector-001',
    expiresAt: new Date('2026-08-10T18:00:00Z'),
    mercadoPagoPaymentId: null,
    consumedAt: null,
    createdAt: new Date('2026-08-09T18:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-14T18:00:00.000Z'));
  vi.clearAllMocks();
  mocks.insertedPagos.length = 0;
  mocks.insertedTickets.length = 0;
  mocks.insertedOutbox.length = 0;
  mocks.insertedAudits.length = 0;
  mocks.updateValues.length = 0;
  mocks.findManyPagos.mockResolvedValue([]);
  mocks.findPago.mockResolvedValue(null);
  mocks.findPaymentIntent.mockResolvedValue(null);
  mocks.findPerfil.mockResolvedValue({
    id: 'perfil-001',
    circuitoId: 'circuito-001',
    estadoAgua: 'activo',
    creadoEn: new Date('2026-08-01T18:00:00.000Z'),
  });
  mocks.execute.mockResolvedValue(undefined);

  mocks.insert.mockImplementation(() => ({
    values: (values: unknown) => {
      const first = Array.isArray(values) ? values[0] : values;
      if (first && typeof first === 'object' && 'mes' in first) {
        const paymentValues = Array.isArray(values) ? values : [values];
        mocks.insertedPagos.push(...paymentValues);
        return {
          returning: async () => paymentValues.map((value, index) => persistedPago(value as CrearPagoInput, index)),
        };
      }
      if (first && typeof first === 'object' && 'pagoId' in first) {
        mocks.insertedTickets.push(...(Array.isArray(values) ? values : [values]));
        return Promise.resolve();
      }
      if (first && typeof first === 'object' && 'accion' in first && 'entidad' in first) {
        mocks.insertedAudits.push(first);
        return Promise.resolve();
      }
      mocks.insertedOutbox.push(values);
      return { onConflictDoNothing: async () => undefined };
    },
  }));
  mocks.update.mockImplementation(() => ({
    set: (values: unknown) => {
      mocks.updateValues.push(values);
      return { where: async () => undefined };
    },
  }));

  const tx = {
    execute: mocks.execute,
    query: {
      pagos: { findFirst: mocks.findPago, findMany: mocks.findManyPagos },
      perfilesResidente: { findFirst: mocks.findPerfil },
      mercadoPagoPaymentIntents: { findFirst: mocks.findPaymentIntent },
    },
    insert: mocks.insert,
    update: mocks.update,
  };
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DrizzlePagoRepository.createWithLock', () => {
  it('persiste la auditoria opcional en la misma transaccion usando el id del pago', async () => {
    const manualInput: CrearPagoInput = {
      ...pagoInput(8),
      metodo: 'efectivo',
      mercadoPagoPaymentId: undefined,
    };

    const result = await new DrizzlePagoRepository().createWithLock(
      manualInput.perfilId,
      manualInput,
      {
        userId: 'user-001',
        perfilId: manualInput.perfilId,
        tipo: 'pago_confirmado',
        mensaje: 'Pago confirmado',
        dedupeKey: 'pago_confirmado:folio:AGU-08',
      },
      {
        actorId: 'representante-001',
        accion: 'pago.manual.representante',
        metodo: 'efectivo',
      },
    );

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(result.id).toBe('pago-0');
    expect(mocks.insertedAudits).toEqual([{
      actorId: 'representante-001',
      accion: 'pago.manual.representante',
      entidad: 'pago',
      entidadId: 'pago-0',
      detalle: {
        perfilId: 'perfil-001',
        metodo: 'efectivo',
        folio: 'AGU-08',
      },
    }]);
  });
});

describe('DrizzlePagoRepository.createManualBatchWithLock', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'registra atomicamente %i mes(es) atrasado(s)',
    async cantidad => {
      mocks.findPerfil.mockResolvedValue({
        id: 'perfil-001',
        circuitoId: 'circuito-001',
        estadoAgua: 'activo',
        creadoEn: new Date('2025-08-01T18:00:00.000Z'),
      });
      const solicitados = pagosDesdePeriodo(cantidad, { mes: 8, anio: 2025 });

      const result = await new DrizzlePagoRepository().createManualBatchWithLock(
        manualBatch(solicitados),
      );

      expect(result.omitidos).toEqual([]);
      expect(result.pagos).toHaveLength(cantidad);
      expect(mocks.insertedPagos).toHaveLength(cantidad);
      expect(mocks.insertedTickets).toHaveLength(cantidad);
      expect(mocks.insertedOutbox).toHaveLength(1);
      expect(mocks.insertedAudits).toHaveLength(1);
    },
  );

  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'registra atomicamente %i mes(es) adelantado(s)',
    async cantidad => {
      const actualPagado = manualPagoInput(8);
      mocks.findManyPagos.mockResolvedValue([persistedPago(actualPagado, 0)]);
      const solicitados = pagosDesdePeriodo(cantidad, { mes: 9, anio: 2026 });

      const result = await new DrizzlePagoRepository().createManualBatchWithLock(
        manualBatch(solicitados),
      );

      expect(result.omitidos).toEqual([]);
      expect(result.pagos).toHaveLength(cantidad);
      expect(mocks.insertedPagos).toHaveLength(cantidad);
      expect(mocks.insertedTickets).toHaveLength(cantidad);
      expect(mocks.insertedOutbox).toHaveLength(1);
      expect(mocks.insertedAudits).toHaveLength(1);
    },
  );

  it('rechaza trece meses de tesoreria antes de abrir una transaccion', async () => {
    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch(pagosDesdePeriodo(13, { mes: 8, anio: 2025 })),
    )).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insertedPagos).toHaveLength(0);
  });

  it('registra el mes actual para tesorera cuando no existen atrasos', async () => {
    const result = await new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(8)]),
    );

    expect(result.omitidos).toEqual([]);
    expect(result.pagos).toHaveLength(1);
    expect(result.pagos[0]).toMatchObject({ mes: 8, anio: 2026 });
    expect(mocks.insertedPagos).toHaveLength(1);
    expect(mocks.insertedTickets).toHaveLength(1);
    expect(mocks.insertedOutbox).toHaveLength(1);
    expect(mocks.insertedAudits).toHaveLength(1);
  });

  it('permite adelantar cuando el mes actual ya esta pagado', async () => {
    mocks.findManyPagos.mockResolvedValue([
      persistedPago(manualPagoInput(8), 0),
    ]);

    const result = await new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(9)]),
    );

    expect(result.omitidos).toEqual([]);
    expect(result.pagos).toHaveLength(1);
    expect(result.pagos[0]).toMatchObject({ mes: 9, anio: 2026 });
    expect(mocks.insertedPagos).toHaveLength(1);
    expect(mocks.insertedTickets).toHaveLength(1);
    expect(mocks.insertedOutbox).toHaveLength(1);
    expect(mocks.insertedAudits).toHaveLength(1);
  });

  it('rechaza atomicamente un periodo ya pagado para tesorera', async () => {
    const agosto = manualPagoInput(8);
    mocks.findManyPagos.mockResolvedValue([persistedPago(agosto, 0)]);

    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([agosto]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
    expect(mocks.insertedAudits).toHaveLength(0);
  });

  it('bloquea el mes actual mientras existan periodos atrasados', async () => {
    mocks.findPerfil.mockResolvedValue({
      id: 'perfil-001',
      circuitoId: 'circuito-001',
      estadoAgua: 'activo',
      creadoEn: new Date('2026-06-15T18:00:00.000Z'),
    });

    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(8)]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
    expect(mocks.insertedAudits).toHaveLength(0);
  });

  it('bloquea periodos futuros mientras el mes actual no este pagado', async () => {
    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(9)]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
    expect(mocks.insertedAudits).toHaveLength(0);
  });

  it('rechaza si el perfil cambio de circuito antes de adquirir el lock', async () => {
    mocks.findPerfil.mockResolvedValue({
      id: 'perfil-001',
      circuitoId: 'circuito-movido',
      estadoAgua: 'activo',
      creadoEn: new Date('2026-08-01T18:00:00.000Z'),
    });

    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(8)]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
    expect(mocks.insertedAudits).toHaveLength(0);
  });

  it('mantiene la omision de periodos pagados para el retroactivo de admin', async () => {
    const julio = manualPagoInput(7);
    const agosto = manualPagoInput(8);
    mocks.findManyPagos.mockResolvedValue([persistedPago(julio, 0)]);

    const result = await new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([julio, agosto], { tipo: 'admin_retroactivo' }),
    );

    expect(result.omitidos).toEqual([{ mes: 7, anio: 2026 }]);
    expect(result.pagos).toHaveLength(1);
    expect(result.pagos[0]).toMatchObject({ mes: 8, anio: 2026 });
    expect(mocks.insertedPagos).toHaveLength(1);
    expect(mocks.insertedTickets).toHaveLength(1);
    expect(mocks.insertedOutbox).toHaveLength(1);
    expect(mocks.insertedAudits).toHaveLength(1);
  });

  it('traduce una colision de unicidad concurrente a conflicto', async () => {
    mocks.transaction.mockRejectedValueOnce({ code: '23505' });

    await expect(new DrizzlePagoRepository().createManualBatchWithLock(
      manualBatch([manualPagoInput(8)]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('DrizzlePagoRepository.createMercadoPagoBatchWithLock', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'acredita %i periodo(s) y hace idempotente el replay completo',
    async cantidad => {
      const solicitados = Array.from({ length: cantidad }, (_, index) => pagoInput(index + 1));
      const repository = new DrizzlePagoRepository();

      const first = await repository.createMercadoPagoBatchWithLock(batch(solicitados));
      expect(first.yaRegistrado).toBe(false);
      expect(first.pagos).toHaveLength(cantidad);
      expect(mocks.insertedPagos).toHaveLength(cantidad);
      expect(mocks.insertedTickets).toHaveLength(cantidad);
      expect(mocks.insertedOutbox).toHaveLength(1);

      mocks.findManyPagos.mockResolvedValue(
        solicitados.map((pago, index) => persistedPago(pago, index)),
      );
      const replay = await repository.createMercadoPagoBatchWithLock(batch(solicitados));

      expect(replay.yaRegistrado).toBe(true);
      expect(replay.pagos).toHaveLength(cantidad);
      expect(mocks.insertedPagos).toHaveLength(cantidad);
      expect(mocks.insertedTickets).toHaveLength(cantidad);
      expect(mocks.insertedOutbox).toHaveLength(1);
    },
  );

  it('valida y consume la intencion en la misma transaccion que acredita el pago', async () => {
    mocks.findPaymentIntent
      .mockResolvedValueOnce(paymentIntent())
      .mockResolvedValueOnce(null);

    const result = await new DrizzlePagoRepository().createMercadoPagoBatchWithLock({
      ...batch([pagoInput(4)]),
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
    });

    expect(result.yaRegistrado).toBe(false);
    expect(mocks.insertedPagos).toHaveLength(1);
    expect(mocks.updateValues).toEqual([
      {
        mercadoPagoPaymentId: 'payment-001',
        consumedAt: expect.any(Date),
      },
    ]);
  });

  it.each([
    ['periods_mismatch', { periodos: [{ mes: 4, anio: 2026, monto: '101.00', esReconexion: false }] }],
    ['total_mismatch', { total: '999.00' }],
    ['already_consumed', { mercadoPagoPaymentId: 'payment-ajeno', consumedAt: new Date() }],
    ['already_consumed', { mercadoPagoPaymentId: 'payment-001', consumedAt: null }],
  ])('rechaza atomicamente una intencion incompatible: %s', async (reason, override) => {
    mocks.findPaymentIntent.mockResolvedValueOnce(paymentIntent(override));

    const operation = new DrizzlePagoRepository().createMercadoPagoBatchWithLock({
      ...batch([pagoInput(4)]),
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
    });

    await expect(operation).rejects.toMatchObject({
      name: 'MercadoPagoPaymentIntentConflictError',
      reason,
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
      requestedPaymentId: 'payment-001',
    });
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.updateValues).toHaveLength(0);
  });

  it('rechaza una referencia opaca que no existe sin acreditar periodos', async () => {
    mocks.findPaymentIntent.mockResolvedValueOnce(null);

    await expect(new DrizzlePagoRepository().createMercadoPagoBatchWithLock({
      ...batch([pagoInput(4)]),
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
    })).rejects.toMatchObject({
      name: 'MercadoPagoPaymentIntentConflictError',
      reason: 'not_found',
    });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.updateValues).toHaveLength(0);
  });

  it('rechaza reutilizar un paymentId ya ligado a otra intencion', async () => {
    mocks.findPaymentIntent
      .mockResolvedValueOnce(paymentIntent())
      .mockResolvedValueOnce(paymentIntent({
        externalReference: `agua_${'b'.repeat(48)}`,
        mercadoPagoPaymentId: 'payment-001',
        consumedAt: new Date('2026-08-09T19:00:00Z'),
      }));

    await expect(new DrizzlePagoRepository().createMercadoPagoBatchWithLock({
      ...batch([pagoInput(4)]),
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
    })).rejects.toMatchObject({
      name: 'MercadoPagoPaymentIntentConflictError',
      reason: 'already_consumed',
    });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.updateValues).toHaveLength(0);
  });

  it('permite el replay del mismo paymentId y conserva la fecha de consumo', async () => {
    const consumedAt = new Date('2026-08-09T19:00:00Z');
    const storedIntent = paymentIntent({
      mercadoPagoPaymentId: 'payment-001',
      consumedAt,
    });
    mocks.findPaymentIntent
      .mockResolvedValueOnce(storedIntent)
      .mockResolvedValueOnce(storedIntent);
    mocks.findManyPagos.mockResolvedValue([persistedPago(pagoInput(4), 0)]);

    const result = await new DrizzlePagoRepository().createMercadoPagoBatchWithLock({
      ...batch([pagoInput(4)]),
      paymentIntentReference: PAYMENT_INTENT_REFERENCE,
    });

    expect(result.yaRegistrado).toBe(true);
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.updateValues).toEqual([{
      mercadoPagoPaymentId: 'payment-001',
      consumedAt,
    }]);
  });

  it('inserta doce pagos y folios, cancela cortes y crea un solo outbox en una transaccion', async () => {
    const result = await new DrizzlePagoRepository().createMercadoPagoBatchWithLock(batch());

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalled();
    expect(mocks.insertedPagos).toHaveLength(12);
    expect(mocks.insertedTickets).toHaveLength(12);
    expect(mocks.insertedOutbox).toHaveLength(1);
    expect(result.pagos).toHaveLength(12);
    expect(result.yaRegistrado).toBe(false);
  });

  it('trata el replay del mismo paymentId como idempotente sin duplicar pagos, folios ni outbox', async () => {
    mocks.findManyPagos.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => persistedPago(pagoInput(index + 1), index)),
    );

    const result = await new DrizzlePagoRepository().createMercadoPagoBatchWithLock(batch());

    expect(result.yaRegistrado).toBe(true);
    expect(result.pagos).toHaveLength(12);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
  });

  it('no vuelve a acreditar ni cancela avisos cuando el mismo paymentId fue reversado', async () => {
    mocks.findManyPagos.mockResolvedValue([
      { ...persistedPago(pagoInput(4), 0), estado: 'vencido' },
    ]);

    const result = await new DrizzlePagoRepository().createMercadoPagoBatchWithLock(
      batch([pagoInput(4)]),
    );

    expect(result.yaRegistrado).toBe(true);
    expect(result.pagos).toMatchObject([{ estado: 'vencido', mercadoPagoPaymentId: 'payment-001' }]);
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
    // Advisory lock + profile lock; no third execute for notification cancellation.
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('rechaza reutilizar en otro perfil un paymentId aunque el pago anterior este vencido', async () => {
    mocks.findManyPagos.mockResolvedValue([
      {
        ...persistedPago(pagoInput(4), 0),
        perfilId: 'perfil-ajeno',
        estado: 'vencido',
      },
    ]);

    const operation = new DrizzlePagoRepository().createMercadoPagoBatchWithLock(
      batch([pagoInput(4)]),
    );

    await expect(operation).rejects.toMatchObject({
      name: 'MercadoPagoPeriodConflictError',
      requestedPaymentId: 'payment-001',
      conflicts: [{ mes: 4, anio: 2026, existingPerfilId: 'perfil-ajeno' }],
    });
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
  });

  it('revalida bajo lock que el perfil siga en el circuito verificado', async () => {
    mocks.findPerfil.mockResolvedValue({
      id: 'perfil-001',
      circuitoId: 'circuito-movido',
      estadoAgua: 'activo',
    });

    await expect(new DrizzlePagoRepository().createMercadoPagoBatchWithLock(
      batch([pagoInput(4)]),
    )).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
  });

  it('rechaza atomicamente si un periodo ya pertenece a otro paymentId', async () => {
    mocks.findManyPagos.mockResolvedValue([
      persistedPago({ ...pagoInput(4), mercadoPagoPaymentId: 'payment-anterior' }, 0),
    ]);

    const operation = new DrizzlePagoRepository().createMercadoPagoBatchWithLock(
      batch([pagoInput(4)]),
    );

    await expect(operation).rejects.toMatchObject({
      name: 'MercadoPagoPeriodConflictError',
      requestedPaymentId: 'payment-001',
      conflicts: [{ mes: 4, anio: 2026, existingPaymentId: 'payment-anterior' }],
    });
    await expect(operation).rejects.toBeInstanceOf(MercadoPagoPeriodConflictError);
    expect(mocks.insertedPagos).toHaveLength(0);
    expect(mocks.insertedTickets).toHaveLength(0);
    expect(mocks.insertedOutbox).toHaveLength(0);
  });
});
