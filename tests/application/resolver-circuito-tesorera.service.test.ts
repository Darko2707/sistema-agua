import { describe, expect, it, vi } from 'vitest';

import { ResolverCircuitoTesoreraService } from '@/src/application/circuitos/queries/resolver-circuito-tesorera.service';
import type { CircuitoRepository } from '@/src/application/ports/circuito.repository';

function createService() {
  const findByTesorera = vi.fn();
  const circuitoRepo = { findByTesorera } as unknown as CircuitoRepository;
  return {
    findByTesorera,
    service: new ResolverCircuitoTesoreraService({ circuitoRepo }),
  };
}

describe('ResolverCircuitoTesoreraService', () => {
  it('devuelve unicamente el circuito que tiene la asignacion explicita', async () => {
    const { service, findByTesorera } = createService();
    findByTesorera.mockResolvedValue({
      id: 'circuito-1',
      nombre: 'Circuito 1',
      tesoreraId: 'tesorera-1',
      representanteId: null,
      montoMensual: '100.00',
      montoReconexion: '300.00',
      mercadoPagoAccessToken: null,
      mercadoPagoCollectorId: null,
      diaCorte: 5,
      activo: true,
    });

    await expect(service.execute('tesorera-1')).resolves.toMatchObject({
      id: 'circuito-1',
      tesoreraId: 'tesorera-1',
    });
    expect(findByTesorera).toHaveBeenCalledWith('tesorera-1');
  });

  it('no usa el perfil residencial como asignacion implicita', async () => {
    const { service, findByTesorera } = createService();
    findByTesorera.mockResolvedValue(null);

    await expect(service.execute('tesorera-sin-asignacion')).resolves.toBeNull();
    expect(findByTesorera).toHaveBeenCalledTimes(1);
  });

  it('rechaza defensivamente un circuito asociado a otra tesorera', async () => {
    const { service, findByTesorera } = createService();
    findByTesorera.mockResolvedValue({
      id: 'circuito-1',
      tesoreraId: 'otra-tesorera',
    });

    await expect(service.execute('tesorera-1')).resolves.toBeNull();
  });
});
