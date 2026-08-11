import { TRPCError } from '@trpc/server';
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

    if (query.rol === 'admin') {
      return query.tipo === 'reconexion'
        ? residenteRepo.findByEstado('pendiente_reconexion')
        : residenteRepo.findByEstado('pendiente_corte');
    }

    if (query.rol === 'representante') {
      const circ = await circuitoRepo.findByRepresentante(query.userId);
      if (!circ) return [];
      return residenteRepo.findByCircuitoYEstado(circ.id, 'pendiente_corte');
    }

    const perfilTrabajador = await residenteRepo.findByUserId(query.userId);
    if (!perfilTrabajador) {
      throw new TRPCError({
        code:    'FORBIDDEN',
        message: 'Esta cuenta de cuadrilla no tiene un circuito asignado. Asigna el rol a un residente del circuito desde el panel del representante.',
      });
    }
    return residenteRepo.findByCircuitoYEstado(
      perfilTrabajador.circuitoId,
      query.tipo === 'reconexion' ? 'pendiente_reconexion' : 'pendiente_corte',
    );
  }
}

