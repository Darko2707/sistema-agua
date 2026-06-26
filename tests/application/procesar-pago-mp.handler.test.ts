import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';
import type { PagoRepository, PagoData } from '@/src/application/ports/pago.repository';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

const CMD = {
  perfilId: 'perf-001',
  mes: 6,
  anio: 2025,
  monto: '100.00',
  esReconexion: false,
  metodo: 'mercado_pago:12345',
  mercadoPagoPaymentId:   '12345',
  mercadoPagoCollectorId: null as string | null,
};

const PAGO: PagoData = {
  id: 'pago-001', folio: 'AGU-001', perfilId: 'perf-001', circuitoId: 'circ-001',
  representanteId: 'rep-001', mes: 6, anio: 2025, monto: '100.00', montoBase: '100.00',
  iva: '0.00', comisionMercadoPago: '4.85', retencionIsr: '0.00', retencionIva: '0.00',
  montoNetoRepresentante: '95.15', mercadoPagoPaymentId: '12345', mercadoPagoCollectorId: null,
  estado: 'pagado', metodo: 'mercado_pago:12345', esReconexion: false, fechaPago: new Date(), creadoEn: new Date(),
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

function makeDeps() {
  const pagoRepo: PagoRepository = {
    findByPerfilYMes:     vi.fn().mockResolvedValue(null),
    findByPerfilId:       vi.fn(),
    findAllPagadosPorMes: vi.fn(),
    findPagadosByMes:     vi.fn(),
    createWithLock:       vi.fn().mockResolvedValue(PAGO),
    findCorteActivo:      vi.fn(),
    crearCorte:           vi.fn(),
    cerrarCorte:          vi.fn(),
    crearTicket:          vi.fn(),
    marcarPendientesVencidos: vi.fn(),
    getMetricasAdmin:     vi.fn(),
  };
  const residenteRepo: ResidenteRepository = {
    findById:             vi.fn().mockResolvedValue(PERFIL),
    findByUserId:         vi.fn(),
    findByCircuito:       vi.fn(),
    findAll:              vi.fn(),
    findByEstado:         vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create:               vi.fn(),
    updateEstado:         vi.fn(),
    marcarMorososDelMes:  vi.fn(),
    findAllPaginated:     vi.fn(),
    findByCircuitoPaginated: vi.fn(),
  };
  const circuitoRepo: CircuitoRepository = {
    findById:                 vi.fn().mockResolvedValue(CIRCUITO),
    findByRepresentante:      vi.fn(),
    findByTesorera:           vi.fn(),
    findAll:                  vi.fn(),
    findActivos:              vi.fn(),
    updateActivo:             vi.fn(),
    updateMontos:             vi.fn(),
    updateRepresentante:      vi.fn(),
    updateTesorera:           vi.fn(),
    updateRepresentanteWithMp: vi.fn(),
    updateTesoreraWithMp:     vi.fn(),
    clearRepresentanteByUserId: vi.fn(),
    clearTesoreraByUserId:    vi.fn(),
  };
  return { pagoRepo, residenteRepo, circuitoRepo };
}

describe('ProcesarPagoMpHandler', () => {
  describe('idempotencia', () => {
    it('devuelve el pago existente sin crear uno nuevo', async () => {
      const deps = makeDeps();
      vi.mocked(deps.pagoRepo.findByPerfilYMes).mockResolvedValue(PAGO);
      const result = await new ProcesarPagoMpHandler(deps).execute(CMD);
      expect(result.yaRegistrado).toBe(true);
      expect(result.folio).toBe('AGU-001');
      expect(deps.pagoRepo.createWithLock).not.toHaveBeenCalled();
      expect(deps.residenteRepo.findById).not.toHaveBeenCalled();
    });

    it('devuelve esReconexion del pago existente', async () => {
      const deps = makeDeps();
      vi.mocked(deps.pagoRepo.findByPerfilYMes).mockResolvedValue({ ...PAGO, esReconexion: true });
      const result = await new ProcesarPagoMpHandler(deps).execute(CMD);
      expect(result.esReconexion).toBe(true);
    });
  });

  describe('happy path', () => {
    it('crea el pago y devuelve yaRegistrado=false', async () => {
      const deps = makeDeps();
      const result = await new ProcesarPagoMpHandler(deps).execute(CMD);
      expect(result.yaRegistrado).toBe(false);
      expect(result.folio).toBe('AGU-001');
      expect(deps.pagoRepo.createWithLock).toHaveBeenCalledOnce();
    });

    it('pasa mes y anio al repositorio', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute(CMD);
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      expect(input.mes).toBe(6);
      expect(input.anio).toBe(2025);
    });

    it('pasa el metodo con el paymentId', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute(CMD);
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      expect(input.metodo).toBe('mercado_pago:12345');
    });
  });

  describe('precio reconexión', () => {
    it('usa montoMensual + montoReconexion como base cuando esReconexion=true', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute({ ...CMD, esReconexion: true });
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      // 100 + 300 = 400
      expect(parseFloat(input.montoBase)).toBeCloseTo(400, 0);
    });

    it('usa cmd.monto como base cuando esReconexion=false', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute({ ...CMD, monto: '150.00' });
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      expect(parseFloat(input.montoBase)).toBeCloseTo(150, 0);
    });
  });

  describe('collectorId', () => {
    it('usa el collectorId del pago si está disponible', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute({ ...CMD, mercadoPagoCollectorId: 'col-from-payment' });
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      expect(input.mercadoPagoCollectorId).toBe('col-from-payment');
    });

    it('usa el collectorId del circuito como fallback', async () => {
      const deps = makeDeps();
      await new ProcesarPagoMpHandler(deps).execute({ ...CMD, mercadoPagoCollectorId: null });
      const [, input] = vi.mocked(deps.pagoRepo.createWithLock).mock.calls[0];
      expect(input.mercadoPagoCollectorId).toBe('col-circuito');
    });
  });

  describe('errores', () => {
    it('lanza si el perfil no existe', async () => {
      const deps = makeDeps();
      vi.mocked(deps.residenteRepo.findById).mockResolvedValue(null);
      await expect(new ProcesarPagoMpHandler(deps).execute(CMD)).rejects.toThrow('Perfil no encontrado');
    });

    it('lanza si el circuito no existe', async () => {
      const deps = makeDeps();
      vi.mocked(deps.circuitoRepo.findById).mockResolvedValue(null);
      await expect(new ProcesarPagoMpHandler(deps).execute(CMD)).rejects.toThrow('Circuito no encontrado');
    });
  });
});
