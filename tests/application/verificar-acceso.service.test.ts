import { describe, expect, it, vi } from 'vitest';

import {
  RolNoConfiguradoError,
  VerificarAccesoService,
} from '@/src/application/acceso/verificar-acceso.service';
import type { ResidenteRepository } from '@/src/application/ports/residente.repository';

describe('VerificarAccesoService', () => {
  it('deniega por defecto un rol legado sin capacidades configuradas', async () => {
    const findByUserId = vi.fn();
    const service = new VerificarAccesoService({
      residenteRepo: { findByUserId } as unknown as ResidenteRepository,
    });

    await expect(service.execute('operador-1', 'operador_pozo'))
      .rejects.toBeInstanceOf(RolNoConfiguradoError);
    expect(findByUserId).not.toHaveBeenCalled();
  });
});
