import { TRPCError } from '@trpc/server';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import type { PendientesCortQuery } from './pendientes-corte.query';

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
  findFraccionamientosAsignados: (userId: string) => Promise<string[]>;
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
      if (!circ?.fraccionamientoId) return [];
      if (!residenteRepo.findByFraccionamientoYEstado) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Repositorio de residentes sin consulta por fraccionamiento' });
      }
      return residenteRepo.findByFraccionamientoYEstado(circ.fraccionamientoId, 'pendiente_corte');
    }

    const fraccionamientosAsignados = await this.deps.findFraccionamientosAsignados(query.userId);
    if (fraccionamientosAsignados.length === 0) {
      throw new TRPCError({
        code:    'FORBIDDEN',
        message: 'Esta cuenta de cuadrilla no tiene un circuito asignado ni una asignación operativa activa.',
      });
    }
    if (!residenteRepo.findByFraccionamientoYEstado) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Repositorio de residentes sin consulta por fraccionamiento' });
    }
    const rows = await Promise.all(fraccionamientosAsignados.map((fraccionamientoId) => residenteRepo.findByFraccionamientoYEstado!(
      fraccionamientoId,
      query.tipo === 'reconexion' ? 'pendiente_reconexion' : 'pendiente_corte',
    )));
    return rows.flat();
  }
}

