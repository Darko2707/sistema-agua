import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';

export type ListarResidentesQuery = {
  rol: 'admin' | 'representante';
  userId: string;
};

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
};

export class ListarResidentesHandler {
  constructor(private deps: Deps) {}

  async execute(query: ListarResidentesQuery) {
    const { residenteRepo, circuitoRepo } = this.deps;
    const periodo = PeriodoVO.vigente();
    const vencido = new Date().getDate() > DIA_CORTE;

    let perfiles;
    if (query.rol === 'admin') {
      perfiles = await residenteRepo.findAll();
    } else {
      const miCircuito = await circuitoRepo.findByRepresentante(query.userId);
      if (!miCircuito) return [];
      perfiles = await residenteRepo.findByCircuito(miCircuito.id);
    }

    return perfiles.map((p) => ({
      id:                  p.id,
      edificio:            p.edificio,
      departamento:        p.departamento,
      estadoAgua:          p.estadoAgua,
      tenencia:            p.tenencia ?? null,
      nombrePropietario:   p.nombrePropietario ?? null,
      telefonoPropietario: p.telefonoPropietario ?? null,
      usuario: {
        id:    p.usuario?.id,
        name:  p.usuario?.name,
        email: p.usuario?.email,
        role:  p.usuario?.role,
      },
      circuito:     p.circuito,
      pagoEsteMes:  p.pagos?.some(pg => pg.mes === periodo.mes && pg.anio === periodo.anio && pg.estado === 'pagado') ?? false,
      esMoroso:     vencido && !(p.pagos?.some(pg => pg.mes === periodo.mes && pg.anio === periodo.anio && pg.estado === 'pagado') ?? false),
      corteActivo:  p.cortes?.some(c => c.activo) ?? false,
    }));
  }
}
