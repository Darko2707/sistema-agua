import { TRPCError } from '@trpc/server';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import type { PendientesCortQuery } from './pendientes-corte.query';

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
  findCircuitosAsignados?: (userId: string) => Promise<string[]>;
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

    const circuitosAsignados = this.deps.findCircuitosAsignados
      ? await this.deps.findCircuitosAsignados(query.userId)
      : null;
    if (circuitosAsignados === null) {
      const perfilTrabajador = await residenteRepo.findByUserId(query.userId);
      if (!perfilTrabajador) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta cuenta de cuadrilla no tiene un circuito asignado.' });
      }
      return residenteRepo.findByCircuitoYEstado(
        perfilTrabajador.circuitoId,
        query.tipo === 'reconexion' ? 'pendiente_reconexion' : 'pendiente_corte',
      );
    }
    if (circuitosAsignados.length === 0) {
      throw new TRPCError({
        code:    'FORBIDDEN',
        message: 'Esta cuenta de cuadrilla no tiene un circuito asignado ni una asignación operativa activa.',
      });
    }
    const rows = await Promise.all(circuitosAsignados.map((circuitoId) => residenteRepo.findByCircuitoYEstado(
      circuitoId,
      query.tipo === 'reconexion' ? 'pendiente_reconexion' : 'pendiente_corte',
    )));
    return rows.flat();
  }
}

