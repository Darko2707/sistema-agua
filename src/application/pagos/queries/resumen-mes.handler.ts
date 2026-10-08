import type { PagoRepository } from '../../ports/pago.repository';
import type { ResidenteRepository } from '../../ports/residente.repository';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import type { ResumenMesQuery } from './resumen-mes.query';

type Deps = {
  pagoRepo: PagoRepository;
  residenteRepo: ResidenteRepository;
};

export class ResumenMesHandler {
  constructor(private deps: Deps) {}

  async execute(query: ResumenMesQuery) {
    const { pagoRepo, residenteRepo } = this.deps;
    const periodo = PeriodoVO.vigente();

    let perfiles = await residenteRepo.findAll();
    if (query.rol === 'admin') {
    } else {
      perfiles = query.fraccionamientoId
        ? perfiles.filter((perfil) => perfil.fraccionamientoId === query.fraccionamientoId)
        : [];
    }

    const pagosDelMes = await pagoRepo.findAllPagadosPorMes(periodo.mes, periodo.anio);
    const todosLosPagos = await pagoRepo.findPagadosByMes(periodo.mes, periodo.anio);
    const idsPagados = new Set(todosLosPagos.map(p => p.perfilId));

    const pagados = perfiles.filter(p => idsPagados.has(p.id)).length;
    const recaudado = pagosDelMes
      .filter(p => perfiles.some(perf => perf.id === p.perfilId))
      .reduce((acc, p) => acc + parseFloat(p.montoNetoRepresentante ?? '0'), 0);

    const porFraccionamientoMap = new Map<string, { nombre: string; total: number; pagados: number; recaudado: number }>();
    for (const perfil of perfiles) {
      const id = perfil.fraccionamientoId ?? 'sin-fraccionamiento';
      const nombre = perfil.fraccionamiento?.nombre ?? 'Sin fraccionamiento';
      const entry = porFraccionamientoMap.get(id) ?? { nombre, total: 0, pagados: 0, recaudado: 0 };
      entry.total += 1;
      if (idsPagados.has(perfil.id)) {
        entry.pagados += 1;
        const pago = pagosDelMes.find(p => p.perfilId === perfil.id);
        if (pago) entry.recaudado += parseFloat(pago.montoNetoRepresentante ?? '0');
      }
      porFraccionamientoMap.set(id, entry);
    }

    return {
      totalDeptos: perfiles.length,
      pagados,
      recaudado,
      mes: periodo.mes,
      anio: periodo.anio,
      porFraccionamiento: Array.from(porFraccionamientoMap.values()),
    };
  }
}
