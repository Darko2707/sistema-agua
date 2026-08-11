import { describe, expect, it, vi } from 'vitest';

import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

function createDeps() {
  const residenteRepo = {
    findByUserId: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
  } as unknown as ResidenteRepository & {
    findByUserId: ReturnType<typeof vi.fn>;
    findByEstado: ReturnType<typeof vi.fn>;
    findByCircuitoYEstado: ReturnType<typeof vi.fn>;
  };

  const circuitoRepo = {
    findByRepresentante: vi.fn(),
  } as unknown as CircuitoRepository & {
    findByRepresentante: ReturnType<typeof vi.fn>;
  };

  return { residenteRepo, circuitoRepo };
}

describe('PendientesCorteHandler', () => {
  it('limita los pendientes de cuadrilla al circuito de su propio perfil', async () => {
    const { residenteRepo, circuitoRepo } = createDeps();
    residenteRepo.findByUserId.mockResolvedValue({
      id: 'perfil-trabajador',
      userId: 'trab-1',
      circuitoId: 'circuito-1',
      edificio: '1',
      departamento: '101',
      estadoAgua: 'activo',
      creadoEn: new Date(),
    });
    residenteRepo.findByCircuitoYEstado.mockResolvedValue([{ id: 'perfil-corte' }]);
    const handler = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

    const result = await handler.execute({
      rol: 'cuadrilla_cortes',
      userId: 'trab-1',
      tipo: 'corte',
    });

    expect(result).toEqual([{ id: 'perfil-corte' }]);
    expect(residenteRepo.findByEstado).not.toHaveBeenCalled();
    expect(residenteRepo.findByCircuitoYEstado).toHaveBeenCalledWith('circuito-1', 'pendiente_corte');
  });

  it('limita reconexiones de cuadrilla al mismo circuito', async () => {
    const { residenteRepo, circuitoRepo } = createDeps();
    residenteRepo.findByUserId.mockResolvedValue({
      id: 'perfil-trabajador',
      userId: 'trab-1',
      circuitoId: 'circuito-2',
      edificio: '1',
      departamento: '101',
      estadoAgua: 'activo',
      creadoEn: new Date(),
    });
    residenteRepo.findByCircuitoYEstado.mockResolvedValue([]);
    const handler = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

    await handler.execute({ rol: 'cuadrilla_cortes', userId: 'trab-1', tipo: 'reconexion' });

    expect(residenteRepo.findByEstado).not.toHaveBeenCalled();
    expect(residenteRepo.findByCircuitoYEstado).toHaveBeenCalledWith('circuito-2', 'pendiente_reconexion');
  });
  it('falla con mensaje claro si la cuadrilla no tiene perfil/circuito', async () => {
    const { residenteRepo, circuitoRepo } = createDeps();
    residenteRepo.findByUserId.mockResolvedValue(null);
    const handler = new PendientesCorteHandler({ residenteRepo, circuitoRepo });

    await expect(handler.execute({
      rol: 'cuadrilla_cortes',
      userId: 'trab-sin-circuito',
      tipo: 'corte',
    })).rejects.toMatchObject({
      code:    'FORBIDDEN',
      message: expect.stringContaining('no tiene un circuito asignado'),
    });
    expect(residenteRepo.findByCircuitoYEstado).not.toHaveBeenCalled();
  });
});
