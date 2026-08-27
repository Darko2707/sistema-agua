import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistorialPagosHandler } from '@/src/application/pagos/queries/historial-pagos.handler';
import type { PagoData, PagoRepository } from '@/src/application/ports/pago.repository';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

const perfil = {
  id: 'perfil-001',
  userId: 'user-001',
  circuitoId: 'circuito-001',
  edificio: '1',
  departamento: 'A',
  estadoAgua: 'activo' as const,
  creadoEn: null,
  circuito: {
    id: 'circuito-001',
    nombre: 'Circuito 1',
    montoMensual: '50.00',
    montoReconexion: '300.00',
    representanteId: 'rep-001',
    activo: true,
  },
};

function pago(mes: number, anio: number): PagoData {
  return {
    id: `pago-${anio}-${mes}`,
    perfilId: perfil.id,
    circuitoId: perfil.circuitoId,
    representanteId: null,
    mes,
    anio,
    monto: '50.00',
    montoBase: '50.00',
    iva: '0.00',
    comisionMercadoPago: '0.00',
    retencionIsr: '0.00',
    retencionIva: '0.00',
    montoNetoRepresentante: '50.00',
    mercadoPagoPaymentId: null,
    mercadoPagoCollectorId: null,
    estado: 'pagado',
    metodo: 'mercado_pago',
    folio: `AGU-${anio}-${mes}`,
    esReconexion: false,
    fechaPago: new Date('2026-08-27T18:00:00.000Z'),
    creadoEn: new Date('2026-08-27T18:00:00.000Z'),
  };
}

function makeDeps(pagos: PagoData[]) {
  const pagoRepo: PagoRepository = {
    findByPerfilYMes: vi.fn(),
    findByPerfilId: vi.fn().mockResolvedValue(pagos),
    findAllPagadosPorMes: vi.fn(),
    findPagadosByMes: vi.fn(),
    createWithLock: vi.fn(),
    createMercadoPagoBatchWithLock: vi.fn(),
    createManualBatchWithLock: vi.fn(),
    findCorteActivo: vi.fn().mockResolvedValue(null),
    crearCorte: vi.fn(),
    cerrarCorte: vi.fn(),
    crearTicket: vi.fn(),
    marcarPendientesVencidos: vi.fn(),
    getMetricasAdmin: vi.fn(),
  };
  const residenteRepo: ResidenteRepository = {
    findById: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue(perfil),
    findByCircuito: vi.fn(),
    findAll: vi.fn(),
    findAllPaginated: vi.fn(),
    findByCircuitoPaginated: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create: vi.fn(),
    updateEstado: vi.fn(),
    marcarMorososDelMes: vi.fn(),
  };
  return { pagoRepo, residenteRepo };
}

describe('HistorialPagosHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa un historial amplio para que pagos adelantados no oculten el mes vigente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T18:00:00.000Z'));

    const pagos = [
      pago(9, 2027),
      pago(8, 2027),
      pago(7, 2027),
      pago(6, 2027),
      pago(5, 2027),
      pago(4, 2027),
      pago(3, 2027),
      pago(2, 2027),
      pago(1, 2027),
      pago(12, 2026),
      pago(11, 2026),
      pago(10, 2026),
      pago(9, 2026),
      pago(8, 2026),
    ];
    const { pagoRepo, residenteRepo } = makeDeps(pagos);
    const handler = new HistorialPagosHandler({ pagoRepo, residenteRepo });

    const result = await handler.execute({ perfilId: perfil.userId });

    expect(pagoRepo.findByPerfilId).toHaveBeenCalledWith(perfil.id, 48);
    expect(result.esMoroso).toBe(false);
    expect(result.pagos).toHaveLength(14);
  });
});
