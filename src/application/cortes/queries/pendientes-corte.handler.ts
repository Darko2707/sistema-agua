import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import type { PendientesCortQuery } from './pendientes-corte.query';

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
};

export class PendientesCorteHandler {
  constructor(private deps: Deps) {}

  async execute(query: PendientesCortQuery) {
    const { residenteRepo, circuitoRepo } = this.deps;

    if (query.tipo === 'reconexion') {
      return residenteRepo.findByEstado('pendiente_reconexion');
    }

    if (query.rol === 'representante') {
      const circ = await circuitoRepo.findByRepresentante(query.userId);
      if (!circ) return [];
      return residenteRepo.findByCircuitoYEstado(circ.id, 'pendiente_corte');
    }

    return residenteRepo.findByEstado('pendiente_corte');
  }
}
