import { describe, expect, it, vi } from 'vitest';

import { PendientesCorteHandler } from '@/src/application/cortes/queries/pendientes-corte.handler';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

function createDeps() {
  const residenteRepo = {
    findByUserId: vi.fn(),
    findByEstado: vi.fn(),
    findByCircuitoYEstado: vi.fn(),
    findByFraccionamientoYEstado: vi.fn(),
  } as unknown as ResidenteRepository & {
    findByUserId: ReturnType<typeof vi.fn>;
    findByEstado: ReturnType<typeof vi.fn>;
    findByCircuitoYEstado: ReturnType<typeof vi.fn>;
    findByFraccionamientoYEstado: ReturnType<typeof vi.fn>;
  };

  const findFraccionamientosAsignados = vi.fn();

  return { residenteRepo, findFraccionamientosAsignados };
}

describe('PendientesCorteHandler', () => {
  it('limita los pendientes de cuadrilla a sus asignaciones operativas explicitas', async () => {
    const { residenteRepo, findFraccionamientosAsignados } = createDeps();
    findFraccionamientosAsignados.mockResolvedValue(['fraccionamiento-1']);
    residenteRepo.findByFraccionamientoYEstado.mockResolvedValue([{ id: 'perfil-corte' }]);
    const handler = new PendientesCorteHandler({ residenteRepo, findFraccionamientosAsignados });

    const result = await handler.execute({
      rol: 'cuadrilla_cortes',
      userId: 'trab-1',
      tipo: 'corte',
    });

    expect(result).toEqual([{ id: 'perfil-corte' }]);
    expect(findFraccionamientosAsignados).toHaveBeenCalledWith('trab-1');
    expect(residenteRepo.findByUserId).not.toHaveBeenCalled();
    expect(residenteRepo.findByEstado).not.toHaveBeenCalled();
    expect(residenteRepo.findByFraccionamientoYEstado).toHaveBeenCalledWith('fraccionamiento-1', 'pendiente_corte');
  });

  it('limita reconexiones de cuadrilla a la asignacion explicita', async () => {
    const { residenteRepo, findFraccionamientosAsignados } = createDeps();
    findFraccionamientosAsignados.mockResolvedValue(['fraccionamiento-2']);
    residenteRepo.findByFraccionamientoYEstado.mockResolvedValue([]);
    const handler = new PendientesCorteHandler({ residenteRepo, findFraccionamientosAsignados });

    await handler.execute({ rol: 'cuadrilla_cortes', userId: 'trab-1', tipo: 'reconexion' });

    expect(residenteRepo.findByEstado).not.toHaveBeenCalled();
    expect(residenteRepo.findByUserId).not.toHaveBeenCalled();
    expect(residenteRepo.findByFraccionamientoYEstado).toHaveBeenCalledWith('fraccionamiento-2', 'pendiente_reconexion');
  });
  it('falla cerrado si la cuadrilla no tiene una asignacion operativa activa', async () => {
    const { residenteRepo, findFraccionamientosAsignados } = createDeps();
    findFraccionamientosAsignados.mockResolvedValue([]);
    const handler = new PendientesCorteHandler({ residenteRepo, findFraccionamientosAsignados });

    await expect(handler.execute({
      rol: 'cuadrilla_cortes',
      userId: 'trab-sin-circuito',
      tipo: 'corte',
    })).rejects.toMatchObject({
      code:    'FORBIDDEN',
      message: expect.stringContaining('asignaci'),
    });
    expect(residenteRepo.findByUserId).not.toHaveBeenCalled();
    expect(residenteRepo.findByFraccionamientoYEstado).not.toHaveBeenCalled();
  });

  it('limita los pendientes del representante a su fraccionamiento de sesion', async () => {
    const { residenteRepo, findFraccionamientosAsignados } = createDeps();
    residenteRepo.findByFraccionamientoYEstado.mockResolvedValue([{ id: 'perfil-representante' }]);
    const handler = new PendientesCorteHandler({ residenteRepo, findFraccionamientosAsignados });

    const result = await handler.execute({
      rol: 'representante',
      userId: 'representante-1',
      fraccionamientoId: 'fraccionamiento-1',
      tipo: 'corte',
    });

    expect(result).toEqual([{ id: 'perfil-representante' }]);
    expect(residenteRepo.findByFraccionamientoYEstado).toHaveBeenCalledWith('fraccionamiento-1', 'pendiente_corte');
    expect(findFraccionamientosAsignados).not.toHaveBeenCalled();
  });
});
