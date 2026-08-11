import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  findManyPagos: vi.fn(),
  findPerfil: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  insertedPagos: [] as unknown[],
  insertedTickets: [] as unknown[],
  insertedOutbox: [] as unknown[],
  updateValues: [] as unknown[],
}));

vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
    query: {
      pagos: { findFirst: vi.fn(), findMany: vi.fn() },
      cortes: { findFirst: vi.fn() },
    },
  },
}));

import { DrizzlePagoRepository } from '@/src/infrastructure/db/repositories/drizzle-pago.repository';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import type {
  CrearPagoInput,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedPagos.length = 0;
  mocks.insertedTickets.length = 0;
  mocks.insertedOutbox.length = 0;
  mocks.updateValues.length = 0;
  mocks.findManyPagos.mockResolvedValue([]);
  mocks.findPerfil.mockResolvedValue({ id: 'perfil-001', estadoAgua: 'activo' });
  mocks.execute.mockResolvedValue(undefined);

  mocks.insert.mockImplementation(() => ({
    values: (values: unknown) => {
      if (Array.isArray(values) && values.length > 0 && 'mes' in values[0]) {
        mocks.insertedPagos.push(...values);
        return {
          returning: async () => values.map((value, index) => persistedPago(value, index)),
        };
      }
      if (Array.isArray(values) && values.length > 0 && 'pagoId' in values[0]) {
        mocks.insertedTickets.push(...values);
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
      pagos: { findMany: mocks.findManyPagos },
      perfilesResidente: { findFirst: mocks.findPerfil },
    },
    insert: mocks.insert,
    update: mocks.update,
  };
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
});

describe('DrizzlePagoRepository.createMercadoPagoBatchWithLock', () => {
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
