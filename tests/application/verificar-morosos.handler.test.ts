import { describe, it, expect, vi, afterEach } from 'vitest';
import { VerificarMorososHandler } from '@/src/application/cron/verificar-morosos.handler';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';
import type { PagoRepository } from '@/src/application/ports/pago.repository';
import { DIA_CORTE } from '@/src/domain/pagos/constants';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeDeps() {
  const residenteRepo = {
    findById:              vi.fn(),
    findByUserId:          vi.fn(),
    findByCircuito:        vi.fn(),
    findAll:               vi.fn(),
    findByEstado:          vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    create:                vi.fn(),
    updateEstado:          vi.fn(),
    marcarMorososDelMes:   vi.fn<[], Promise<number>>().mockResolvedValue(0),
  } as unknown as ResidenteRepository;

  const pagoRepo = {
    findByPerfilYMes:     vi.fn(),
    findByPerfilId:       vi.fn(),
    findAllPagadosPorMes: vi.fn(),
    findPagadosByMes:     vi.fn<[], Promise<{ perfilId: string }[]>>().mockResolvedValue([]),
    createWithLock:       vi.fn(),
    findCorteActivo:      vi.fn(),
    crearCorte:           vi.fn(),
    cerrarCorte:          vi.fn(),
    crearTicket:          vi.fn(),
  } as unknown as PagoRepository;

  return { residenteRepo, pagoRepo };
}

function setDay(year: number, month: number, day: number) {
  // noon — avoids DST edge cases on setSystemTime
  vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
}

afterEach(() => vi.useRealTimers());

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('VerificarMorososHandler', () => {
  describe('umbral de día de corte', () => {
    it('omite el proceso el día 1 (muy por debajo del umbral)', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 1);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      const result = await handler.execute();

      expect(result.procesados).toBe(0);
      expect(result.totalMorosos).toBe(0);
      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).not.toHaveBeenCalled();
      expect(vi.mocked(pagoRepo.findPagadosByMes)).not.toHaveBeenCalled();
    });

    it(`omite en el límite exacto DIA_CORTE=${DIA_CORTE} (dia <= DIA_CORTE)`, async () => {
      vi.useFakeTimers();
      setDay(2025, 6, DIA_CORTE);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      const result = await handler.execute();

      expect(result.procesados).toBe(0);
      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).not.toHaveBeenCalled();
      expect(result.mensaje).toContain(`${DIA_CORTE + 1}`);
    });

    it(`procesa el primer día habilitado DIA_CORTE+1=${DIA_CORTE + 1}`, async () => {
      vi.useFakeTimers();
      setDay(2025, 6, DIA_CORTE + 1);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });
      vi.mocked(residenteRepo.marcarMorososDelMes).mockResolvedValue(4);
      vi.mocked(pagoRepo.findPagadosByMes).mockResolvedValue([
        { perfilId: 'a' }, { perfilId: 'b' },
      ]);

      const result = await handler.execute();

      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).toHaveBeenCalledOnce();
      expect(result.procesados).toBe(4);
      expect(result.totalMorosos).toBe(4);
      expect(result.totalPagados).toBe(2);
    });

    it('procesa en día 28 (mitad de mes)', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 28);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      await handler.execute();

      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).toHaveBeenCalledOnce();
    });
  });

  describe('parámetros de mes y año', () => {
    it('pasa mes y año actuales a ambos repositorios', async () => {
      vi.useFakeTimers();
      setDay(2025, 11, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      await handler.execute();

      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).toHaveBeenCalledWith(11, 2025);
      expect(vi.mocked(pagoRepo.findPagadosByMes)).toHaveBeenCalledWith(11, 2025);
    });

    it('usa enero y el año siguiente al cruzar año nuevo', async () => {
      vi.useFakeTimers();
      setDay(2026, 1, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      await handler.execute();

      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).toHaveBeenCalledWith(1, 2026);
      expect(vi.mocked(pagoRepo.findPagadosByMes)).toHaveBeenCalledWith(1, 2026);
    });

    it('incluye mes, anio y dia en el resultado', async () => {
      vi.useFakeTimers();
      setDay(2025, 8, 20);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      const result = await handler.execute();

      expect(result.mes).toBe(8);
      expect(result.anio).toBe(2025);
      expect(result.dia).toBe(20);
    });

    it('incluye mes, anio y dia en el resultado de omisión', async () => {
      vi.useFakeTimers();
      setDay(2025, 3, 2);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      const result = await handler.execute();

      expect(result.mes).toBe(3);
      expect(result.anio).toBe(2025);
      expect(result.dia).toBe(2);
    });
  });

  describe('ejecución concurrente de repos', () => {
    it('llama a marcarMorososDelMes y findPagadosByMes — ambas exactamente una vez', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });
      vi.mocked(residenteRepo.marcarMorososDelMes).mockResolvedValue(5);
      vi.mocked(pagoRepo.findPagadosByMes).mockResolvedValue([
        { perfilId: 'a' }, { perfilId: 'b' }, { perfilId: 'c' },
      ]);

      await handler.execute();

      expect(vi.mocked(residenteRepo.marcarMorososDelMes)).toHaveBeenCalledOnce();
      expect(vi.mocked(pagoRepo.findPagadosByMes)).toHaveBeenCalledOnce();
    });

    it('resultado combina totalMorosos de residenteRepo y totalPagados de pagoRepo', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });
      vi.mocked(residenteRepo.marcarMorososDelMes).mockResolvedValue(12);
      vi.mocked(pagoRepo.findPagadosByMes).mockResolvedValue(
        Array.from({ length: 88 }, (_, i) => ({ perfilId: `p-${i}` })),
      );

      const result = await handler.execute();

      expect(result.totalMorosos).toBe(12);
      expect(result.totalPagados).toBe(88);
      expect(result.procesados).toBe(12);
    });
  });

  describe('mensajes del resultado', () => {
    it('mensaje de omisión menciona el primer día de corte', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 1);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      const result = await handler.execute();

      expect(result.mensaje).toContain(`${DIA_CORTE + 1}`);
    });

    it('mensaje de proceso incluye el conteo de morosos marcados', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });
      vi.mocked(residenteRepo.marcarMorososDelMes).mockResolvedValue(7);

      const result = await handler.execute();

      expect(result.mensaje).toContain('7');
    });

    it('resultado es cero cuando todos pagaron', async () => {
      vi.useFakeTimers();
      setDay(2025, 6, 15);
      const { residenteRepo, pagoRepo } = makeDeps();
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });
      vi.mocked(residenteRepo.marcarMorososDelMes).mockResolvedValue(0);
      vi.mocked(pagoRepo.findPagadosByMes).mockResolvedValue([{ perfilId: 'x' }]);

      const result = await handler.execute();

      expect(result.totalMorosos).toBe(0);
      expect(result.procesados).toBe(0);
      expect(result.totalPagados).toBe(1);
    });
  });
});
