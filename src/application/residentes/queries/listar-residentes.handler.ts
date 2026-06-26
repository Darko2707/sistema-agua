import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import type { ResidenteRepository, ResidenteConRelaciones, PaginatedResult } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';

export type ListarResidentesQuery = {
  rol: 'admin' | 'representante';
  userId: string;
  page?: number;
  pageSize?: number;
};

type Deps = {
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
};

function mapPerfil(p: ResidenteConRelaciones, periodo: ReturnType<typeof PeriodoVO.vigente>, vencido: boolean) {
  const pagoEsteMes = p.pagos?.some(
    pg => pg.mes === periodo.mes && pg.anio === periodo.anio && pg.estado === 'pagado',
  ) ?? false;
  return {
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
    circuito:    p.circuito,
    pagoEsteMes,
    esMoroso:    vencido && !pagoEsteMes,
    corteActivo: p.cortes?.some(c => c.activo) ?? false,
  };
}

export class ListarResidentesHandler {
  constructor(private deps: Deps) {}

  async execute(query: ListarResidentesQuery) {
    const { residenteRepo, circuitoRepo } = this.deps;
    const periodo = PeriodoVO.vigente();
    const vencido = new Date().getDate() > DIA_CORTE;

    const page     = query.page     ?? 1;
    const pageSize = query.pageSize ?? 50;

    if (query.rol === 'admin') {
      const result = await residenteRepo.findAllPaginated(page, pageSize);
      return {
        items:      result.items.map(p => mapPerfil(p, periodo, vencido)),
        total:      result.total,
        page:       result.page,
        pageSize:   result.pageSize,
        totalPages: result.totalPages,
      };
    }

    const miCircuito = await circuitoRepo.findByRepresentante(query.userId);
    if (!miCircuito) {
      return { items: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const result = await residenteRepo.findByCircuitoPaginated(miCircuito.id, page, pageSize);
    return {
      items:      result.items.map(p => mapPerfil(p, periodo, vencido)),
      total:      result.total,
      page:       result.page,
      pageSize:   result.pageSize,
      totalPages: result.totalPages,
    };
  }
}
