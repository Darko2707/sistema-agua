import { describe, expect, it, vi } from 'vitest';

import { ConfirmarCorteHandler } from '@/src/application/cortes/commands/confirmar-corte.handler';

const mockCorte = {
  id: 'corte-001',
  perfilId: 'perf-001',
  trabajadorId: 'trab-001',
  motivo: 'falta_pago',
  activo: true,
  fechaCorte: new Date('2026-08-09T12:00:00.000Z'),
  fechaReconexion: null,
  reconectadoPor: null,
};

describe('ConfirmarCorteHandler', () => {
  it('delega la operación completa al servicio transaccional', async () => {
    const confirmarCorte = vi.fn().mockResolvedValue(mockCorte);
    const handler = new ConfirmarCorteHandler({
      corteOperacionService: { confirmarCorte },
    });

    const command = { perfilId: 'perf-001', trabajadorId: 'trab-001' };
    await expect(handler.execute(command)).resolves.toBe(mockCorte);
    expect(confirmarCorte).toHaveBeenCalledOnce();
    expect(confirmarCorte).toHaveBeenCalledWith(command);
  });

  it('propaga el error del servicio sin ejecutar una ruta alterna', async () => {
    const failure = new Error('falló la transacción');
    const confirmarCorte = vi.fn().mockRejectedValue(failure);
    const handler = new ConfirmarCorteHandler({
      corteOperacionService: { confirmarCorte },
    });

    await expect(handler.execute({
      perfilId: 'perf-001',
      trabajadorId: 'trab-001',
    })).rejects.toBe(failure);
    expect(confirmarCorte).toHaveBeenCalledOnce();
  });
});
