import { describe, expect, it, vi } from 'vitest';

import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import { calcularDesglosePago } from '@/src/domain/pagos/calculator';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';
import type {
  CrearPagosMercadoPagoBatchInput,
  PagoData,
  PagoRepository,
} from '@/src/application/ports/pago.repository';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

const CMD = {
  perfilId: 'perf-001',
  circuitoId: 'circ-001',
  periodos: [{ mes: 6, anio: 2025, monto: '100.00', esReconexion: false }],
  metodo: 'mercado_pago' as const,
  mercadoPagoPaymentId: '12345',
  mercadoPagoCollectorId: null as string | null,
};

const PERFIL = {
  id: 'perf-001', userId: 'user-001', circuitoId: 'circ-001',
  edificio: 'A', departamento: '101', estadoAgua: 'activo' as const, creadoEn: null,
};

const CIRCUITO = {
  id: 'circ-001', nombre: 'Circuito A', representanteId: 'rep-001', tesoreraId: null,
  montoMensual: '100.00', montoReconexion: '300.00',
  mercadoPagoAccessToken: null, mercadoPagoCollectorId: 'col-circuito', activo: true,
};

const CASOS_MESES_TOTAL = [
  [1, '120.91'],
  [2, '237.18'],
  [3, '353.46'],
  [4, '469.71'],
  [5, '585.98'],
  [6, '702.25'],
  [7, '818.51'],
  [8, '934.77'],
  [9, '1051.04'],
  [10, '1167.30'],
  [11, '1283.58'],
  [12, '1399.84'],
] as const;

function pagoDesdeInput(
  input: CrearPagosMercadoPagoBatchInput['pagos'][number],
  index: number,
): PagoData {
  return {
    ...input,
    id: `pago-${index}`,
    mercadoPagoPaymentId: input.mercadoPagoPaymentId ?? null,
    mercadoPagoCollectorId: input.mercadoPagoCollectorId ?? null,
    creadoEn: new Date(),
  };
}

function makeDeps() {
  const createMercadoPagoBatchWithLock = vi.fn(
    async (input: CrearPagosMercadoPagoBatchInput) => ({
      pagos: input.pagos.map(pagoDesdeInput),
      yaRegistrado: false,
    }),
  );
  const pagoRepo: PagoRepository = {
    findByPerfilYMes: vi.fn(),
    findByPerfilId: vi.fn(),
    findAllPagadosPorMes: vi.fn(),
    findPagadosByMes: vi.fn(),
    createWithLock: vi.fn(),
    createMercadoPagoBatchWithLock,
    createManualBatchWithLock: vi.fn(),
    findCorteActivo: vi.fn(),
    crearCorte: vi.fn(),
    cerrarCorte: vi.fn(),
    crearTicket: vi.fn(),
    marcarPendientesVencidos: vi.fn(),
    getMetricasAdmin: vi.fn(),
  };
  const residenteRepo: ResidenteRepository = {
    findById: vi.fn().mockResolvedValue(PERFIL),
    findByUserId: vi.fn(),
    findByCircuito: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create: vi.fn(),
    updateEstado: vi.fn(),
    marcarMorososDelMes: vi.fn(),
    findAllPaginated: vi.fn(),
    findByCircuitoPaginated: vi.fn(),
  };
  const circuitoRepo: CircuitoRepository = {
    findById: vi.fn().mockResolvedValue(CIRCUITO),
    findByRepresentante: vi.fn(),
    findByTesorera: vi.fn(),
    findAll: vi.fn(),
    findActivos: vi.fn(),
    updateActivo: vi.fn(),
    updateMontos: vi.fn(),
    updateRepresentante: vi.fn(),
    updateTesorera: vi.fn(),
    updateRepresentanteWithMp: vi.fn(),
    updateTesoreraWithMp: vi.fn(),
    clearRepresentanteByUserId: vi.fn(),
    clearTesoreraByUserId: vi.fn(),
  };
  return { pagoRepo, residenteRepo, circuitoRepo, createMercadoPagoBatchWithLock };
}

describe('ProcesarPagoMpHandler', () => {
  it.each(CASOS_MESES_TOTAL)(
    'procesa %i mes(es) mediante una sola operacion batch sin perder centavos',
    async (cantidad, totalEsperado) => {
    const deps = makeDeps();
    const periodos = Array.from({ length: cantidad }, (_, index) => ({
      mes: index + 1,
      anio: 2026,
      monto: '100.00',
      esReconexion: false,
    }));

    const result = await new ProcesarPagoMpHandler(deps).execute({ ...CMD, periodos });

    expect(deps.createMercadoPagoBatchWithLock).toHaveBeenCalledOnce();
    const batch = deps.createMercadoPagoBatchWithLock.mock.calls[0][0];
    expect(batch.pagos).toHaveLength(cantidad);
    expect(batch.pagos.reduce((total, pago) => total + Number(pago.monto), 0).toFixed(2))
      .toBe(totalEsperado);
    expect(calcularDesglosePago(cantidad * 100).total).toBe(totalEsperado);
    expect(batch.pushNotification).toMatchObject({
      userId: 'user-001',
      perfilId: 'perf-001',
      tipo: 'pago_confirmado',
      dedupeKey: 'pago_confirmado:mp:12345:perf-001',
    });
    expect(result.folios).toHaveLength(cantidad);
    expect(result.monto).toBe(totalEsperado);
    expect(deps.pagoRepo.createWithLock).not.toHaveBeenCalled();
    },
  );

  it('devuelve como replay el lote que el repositorio asocia al mismo paymentId', async () => {
    const deps = makeDeps();
    const existing: PagoData = {
      id: 'pago-existente',
      perfilId: 'perf-001',
      circuitoId: 'circ-001',
      representanteId: 'rep-001',
      mes: 6,
      anio: 2025,
      monto: '104.85',
      montoBase: '100.00',
      iva: '0.00',
      comisionMercadoPago: '4.85',
      retencionIsr: '0.00',
      retencionIva: '0.00',
      montoNetoRepresentante: '95.15',
      mercadoPagoPaymentId: '12345',
      mercadoPagoCollectorId: null,
      estado: 'pagado',
      metodo: 'mercado_pago',
      folio: 'AGU-EXISTENTE',
      esReconexion: false,
      fechaPago: new Date(),
      creadoEn: new Date(),
    };
    deps.createMercadoPagoBatchWithLock.mockResolvedValue({ pagos: [existing], yaRegistrado: true });

    const result = await new ProcesarPagoMpHandler(deps).execute(CMD);

    expect(result).toMatchObject({ folio: 'AGU-EXISTENTE', yaRegistrado: true });
    expect(deps.createMercadoPagoBatchWithLock).toHaveBeenCalledOnce();
  });

  it('propaga un conflicto si el periodo pertenece a otro paymentId', async () => {
    const deps = makeDeps();
    deps.createMercadoPagoBatchWithLock.mockRejectedValue(
      new MercadoPagoPeriodConflictError('12345', [{
        mes: 6, anio: 2025, existingPaymentId: 'otro-payment',
      }]),
    );

    await expect(new ProcesarPagoMpHandler(deps).execute(CMD))
      .rejects.toBeInstanceOf(MercadoPagoPeriodConflictError);
  });

  it('usa los importes congelados y el collector del pago', async () => {
    const deps = makeDeps();
    await new ProcesarPagoMpHandler(deps).execute({
      ...CMD,
      mercadoPagoCollectorId: 'collector-payment',
      periodos: [{ mes: 6, anio: 2025, monto: '400.00', esReconexion: true }],
    });

    const pago = deps.createMercadoPagoBatchWithLock.mock.calls[0][0].pagos[0];
    expect(pago.montoBase).toBe('400.00');
    expect(pago.esReconexion).toBe(true);
    expect(pago.mercadoPagoCollectorId).toBe('collector-payment');
  });

  it('usa el collector del circuito como fallback', async () => {
    const deps = makeDeps();
    await new ProcesarPagoMpHandler(deps).execute(CMD);
    expect(deps.createMercadoPagoBatchWithLock.mock.calls[0][0].pagos[0].mercadoPagoCollectorId)
      .toBe('col-circuito');
  });

  it('rechaza lotes vacios, repetidos o sin paymentId antes de consultar repositorios', async () => {
    const deps = makeDeps();
    const handler = new ProcesarPagoMpHandler(deps);
    await expect(handler.execute({ ...CMD, periodos: [] })).rejects.toThrow('entre 1 y 12');
    await expect(handler.execute({ ...CMD, mercadoPagoPaymentId: ' ' })).rejects.toThrow('obligatorio');
    await expect(handler.execute({ ...CMD, periodos: [CMD.periodos[0], CMD.periodos[0]] }))
      .rejects.toThrow('Periodo duplicado');
    expect(deps.residenteRepo.findById).not.toHaveBeenCalled();
  });

  it('lanza si no existen el perfil o el circuito', async () => {
    const deps = makeDeps();
    vi.mocked(deps.residenteRepo.findById).mockResolvedValueOnce(null);
    await expect(new ProcesarPagoMpHandler(deps).execute(CMD)).rejects.toThrow('Perfil no encontrado');

    vi.mocked(deps.residenteRepo.findById).mockResolvedValueOnce(PERFIL);
    vi.mocked(deps.circuitoRepo.findById).mockResolvedValueOnce(null);
    await expect(new ProcesarPagoMpHandler(deps).execute(CMD)).rejects.toThrow('Circuito no encontrado');
  });

  it('rechaza si el perfil ya no pertenece al circuito verificado', async () => {
    const deps = makeDeps();
    vi.mocked(deps.residenteRepo.findById).mockResolvedValueOnce({
      ...PERFIL,
      circuitoId: 'circ-movido',
    });

    await expect(new ProcesarPagoMpHandler(deps).execute(CMD))
      .rejects.toThrow('cambio de circuito');
    expect(deps.circuitoRepo.findById).not.toHaveBeenCalled();
    expect(deps.createMercadoPagoBatchWithLock).not.toHaveBeenCalled();
  });
});
