import { describe, it, expect, vi } from 'vitest';
import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';
import type { PagoRepository } from '@/src/application/ports/pago.repository';

const mockPerfil = {
  id: 'perf-001', userId: 'user-001', circuitoId: 'circ-001',
  edificio: 'A', departamento: '101', estadoAgua: 'pendiente_corte' as const, creadoEn: null,
};

const mockCorte = {
  id: 'corte-001', perfilId: 'perf-001', trabajadorId: 'trab-001',
  motivo: 'falta_pago', activo: true, fechaCorte: new Date(),
  fechaReconexion: null, reconectadoPor: null,
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
    updateEstado: vi.fn().mockResolvedValue(undefined),
  };
  const pagoRepo: PagoRepository = {
    findByPerfilYMes: vi.fn(),
    findByPerfilId: vi.fn(),
    findByCircuitoYMes: vi.fn(),
    findPagadosByMes: vi.fn(),
    createWithLock: vi.fn(),
    findCorteActivo: vi.fn(),
    crearCorte: vi.fn().mockResolvedValue(mockCorte),
    cerrarCorte: vi.fn(),
    crearTicket: vi.fn(),
  };
  return { residenteRepo, pagoRepo };
}

describe('ConfirmarCorteHandler', () => {
  it('confirma corte para residente en pendiente_corte', async () => {
    const deps = makeDeps();
    const handler = new ConfirmarCorteHandler(deps);
    const result = await handler.execute({ perfilId: 'perf-001', trabajadorId: 'trab-001' });
    expect(result?.id).toBe('corte-001');
    expect(deps.residenteRepo.updateEstado).toHaveBeenCalledWith('perf-001', 'cortado');
    expect(deps.pagoRepo.crearCorte).toHaveBeenCalledOnce();
  });

  it('lanza NOT_FOUND si el perfil no existe', async () => {
    const deps = makeDeps();
    vi.mocked(deps.residenteRepo.findById).mockResolvedValue(null);
    const handler = new ConfirmarCorteHandler(deps);
    await expect(handler.execute({ perfilId: 'no-existe', trabajadorId: 'trab-001' })).rejects.toThrow();
  });

  it('lanza si el estado es inválido para EJECUTAR_CORTE', async () => {
    const deps = makeDeps();
    vi.mocked(deps.residenteRepo.findById).mockResolvedValue({ ...mockPerfil, estadoAgua: 'activo' });
    const handler = new ConfirmarCorteHandler(deps);
    await expect(handler.execute({ perfilId: 'perf-001', trabajadorId: 'trab-001' })).rejects.toThrow();
  });
});
