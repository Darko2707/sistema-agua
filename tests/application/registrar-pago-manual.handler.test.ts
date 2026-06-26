import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegistrarPagoManualHandler } from '@/src/application/pagos/commands/registrar-pago-manual.handler';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';
import type { PagoRepository } from '@/src/application/ports/pago.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

const mockCircuitoActivo = {
  id: 'circ-001', nombre: 'Circuito A', representanteId: 'rep-001', tesoreraId: null,
  montoMensual: '50.00', montoReconexion: '300.00',
  mercadoPagoAccessToken: null, mercadoPagoCollectorId: null, activo: true,
};

const mockPerfil = {
  id: 'perf-001', userId: 'user-001', circuitoId: 'circ-001',
  edificio: 'A', departamento: '101', estadoAgua: 'activo' as const, creadoEn: null,
};

const mockPagoCreado = {
  id: 'pago-001', perfilId: 'perf-001', circuitoId: 'circ-001', representanteId: 'rep-001',
  mes: 6, anio: 2025, monto: '50.00', montoBase: '50.00',
  iva: '0.00', comisionMercadoPago: '0.00', retencionIsr: '0.00', retencionIva: '0.00',
  montoNetoRepresentante: '50.00', mercadoPagoPaymentId: null, mercadoPagoCollectorId: null,
  estado: 'pagado' as const, metodo: 'efectivo', folio: 'AGU-TEST000001',
  esReconexion: false, fechaPago: new Date(), creadoEn: new Date(),
};

function makeDeps() {
  const residenteRepo: ResidenteRepository = {
    findById: vi.fn().mockResolvedValue(mockPerfil),
    findByUserId: vi.fn(),
    findByCircuito: vi.fn(),
    findAll: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create: vi.fn(),
    updateEstado: vi.fn(),
    marcarMorososDelMes: vi.fn().mockResolvedValue(0),
    findAllPaginated: vi.fn(),
    findByCircuitoPaginated: vi.fn(),
  };
  const pagoRepo: PagoRepository = {
    findByPerfilYMes: vi.fn().mockResolvedValue(null),
    findByPerfilId: vi.fn(),
    findAllPagadosPorMes: vi.fn(),
    findPagadosByMes: vi.fn(),
    createWithLock: vi.fn().mockResolvedValue(mockPagoCreado),
    findCorteActivo: vi.fn(),
    crearCorte: vi.fn(),
    cerrarCorte: vi.fn(),
    crearTicket: vi.fn(),
    marcarPendientesVencidos: vi.fn(),
    getMetricasAdmin: vi.fn(),
  };
  const circuitoRepo: CircuitoRepository = {
    findById: vi.fn(),
    findByRepresentante: vi.fn().mockResolvedValue(mockCircuitoActivo),
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
  return { residenteRepo, pagoRepo, circuitoRepo };
}

describe('RegistrarPagoManualHandler', () => {
  it('registra un pago manual exitosamente', async () => {
    const deps = makeDeps();
    const handler = new RegistrarPagoManualHandler(deps);
    const result = await handler.execute({ perfilId: 'perf-001', metodo: 'efectivo', representanteId: 'rep-001' });
    expect(result.monto).toBe('50.00');
    expect(result.metodo).toBe('efectivo');
    expect(deps.pagoRepo.createWithLock).toHaveBeenCalledOnce();
  });

  it('lanza si el circuito está inhabilitado', async () => {
    const deps = makeDeps();
    vi.mocked(deps.circuitoRepo.findByRepresentante).mockResolvedValue({ ...mockCircuitoActivo, activo: false });
    const handler = new RegistrarPagoManualHandler(deps);
    await expect(handler.execute({ perfilId: 'perf-001', metodo: 'efectivo', representanteId: 'rep-001' })).rejects.toThrow();
  });

  it('lanza si el representante no tiene circuito', async () => {
    const deps = makeDeps();
    vi.mocked(deps.circuitoRepo.findByRepresentante).mockResolvedValue(null);
    const handler = new RegistrarPagoManualHandler(deps);
    await expect(handler.execute({ perfilId: 'perf-001', metodo: 'efectivo', representanteId: 'rep-001' })).rejects.toThrow();
  });

  it('lanza si el perfil no pertenece al circuito', async () => {
    const deps = makeDeps();
    vi.mocked(deps.residenteRepo.findById).mockResolvedValue({ ...mockPerfil, circuitoId: 'otro-circ' });
    const handler = new RegistrarPagoManualHandler(deps);
    await expect(handler.execute({ perfilId: 'perf-001', metodo: 'efectivo', representanteId: 'rep-001' })).rejects.toThrow();
  });
});
