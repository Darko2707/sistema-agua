import { describe, expect, it, vi } from 'vitest';

import { ConfirmarReconexionHandler } from '@/src/application/cortes/commands/confirmar-reconexion.handler';

describe('ConfirmarReconexionHandler', () => {
  it('delega la operación completa al servicio transaccional', async () => {
    const confirmarReconexion = vi.fn().mockResolvedValue({
      ok: true as const,
      corteId: 'corte-001',
    });
    const handler = new ConfirmarReconexionHandler({
      corteOperacionService: { confirmarReconexion },
    });

    const command = { perfilId: 'perf-001', actorId: 'trab-001' };
    await expect(handler.execute(command)).resolves.toEqual({
      ok: true,
      corteId: 'corte-001',
    });
    expect(confirmarReconexion).toHaveBeenCalledOnce();
    expect(confirmarReconexion).toHaveBeenCalledWith(command);
  });

  it('propaga el error del servicio sin ejecutar una ruta alterna', async () => {
    const failure = new Error('falló la transacción');
    const confirmarReconexion = vi.fn().mockRejectedValue(failure);
    const handler = new ConfirmarReconexionHandler({
      corteOperacionService: { confirmarReconexion },
    });

    await expect(handler.execute({
      perfilId: 'perf-001',
      actorId: 'trab-001',
    })).rejects.toBe(failure);
    expect(confirmarReconexion).toHaveBeenCalledOnce();
  });
});
