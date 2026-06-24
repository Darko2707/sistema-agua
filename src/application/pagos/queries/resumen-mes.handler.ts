import type { PagoRepository } from '../../ports/pago.repository';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import type { ResumenMesQuery } from './resumen-mes.query';

type Deps = {
  pagoRepo: PagoRepository;
  residenteRepo: ResidenteRepository;
  circuitoRepo: CircuitoRepository;
};

export class ResumenMesHandler {
  constructor(private deps: Deps) {}

  async execute(query: ResumenMesQuery) {
    const { pagoRepo, residenteRepo, circuitoRepo } = this.deps;
    const periodo = PeriodoVO.vigente();

    let perfiles;
    if (query.rol === 'admin') {
      perfiles = await residenteRepo.findAll();
    } else {
      const miCircuito = await circuitoRepo.findByRepresentante(query.userId);
      if (!miCircuito) {
        return { totalDeptos: 0, pagados: 0, recaudado: 0, mes: periodo.mes, anio: periodo.anio, porCircuito: [] };
      }
      perfiles = await residenteRepo.findByCircuito(miCircuito.id);
    }

    const pagosDelMes = await pagoRepo.findAllPagadosPorMes(periodo.mes, periodo.anio);
    const todosLosPagos = await pagoRepo.findPagadosByMes(periodo.mes, periodo.anio);
    const idsPagados = new Set(todosLosPagos.map(p => p.perfilId));

    const pagados = perfiles.filter(p => idsPagados.has(p.id)).length;
    const recaudado = pagosDelMes
      .filter(p => perfiles.some(perf => perf.id === p.perfilId))
      .reduce((acc, p) => acc + parseFloat(p.montoNetoRepresentante ?? '0'), 0);

    const porCircuitoMap = new Map<string, { nombre: string; total: number; pagados: number; recaudado: number }>();
    for (const perfil of perfiles) {
      const nombre = perfil.circuito?.nombre ?? 'Sin circuito';
      const entry = porCircuitoMap.get(nombre) ?? { nombre, total: 0, pagados: 0, recaudado: 0 };
      entry.total += 1;
      if (idsPagados.has(perfil.id)) {
        entry.pagados += 1;
        const pago = pagosDelMes.find(p => p.perfilId === perfil.id);
        if (pago) entry.recaudado += parseFloat(pago.montoNetoRepresentante ?? '0');
      }
      porCircuitoMap.set(nombre, entry);
    }

    return {
      totalDeptos: perfiles.length,
      pagados,
      recaudado,
      mes: periodo.mes,
      anio: periodo.anio,
      porCircuito: Array.from(porCircuitoMap.values()),
    };
  }
}
