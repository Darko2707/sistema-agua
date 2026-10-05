import type { ResidenteRepository } from '../ports/residente.repository';
import type { PagoRepository } from '../ports/pago.repository';
import { logger } from '@/lib/logger';
import { fechaNegocio } from '@/src/domain/shared/fecha-negocio';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
};

export class VerificarMorososHandler {
  constructor(private deps: Deps) {}

  async execute() {
    const { dia, mes, anio } = fechaNegocio();

    // El día 1 ningún circuito puede estar vencido porque el corte mínimo
    // configurable es 1. Los demás días se filtran en el repositorio.
    if (dia === 1) {
      logger.info('morosos.omitido', { dia, mes, anio });
      return {
        procesados: 0, totalPagados: 0, totalMorosos: 0, mes, anio, dia,
        mensaje: 'No hay circuitos vencidos el primer día del mes',
      };
    }

    // Run in parallel: the UPDATE (with embedded NOT IN subquery) and the pagados
    // count for reporting. They touch different tables and don't depend on each other.
    const [totalMorosos, pagados] = await Promise.all([
      this.deps.residenteRepo.marcarMorososDelMes(mes, anio, dia),
      this.deps.pagoRepo.findPagadosByMes(mes, anio),
    ]);
    const totalPagados = pagados.length;

    logger.info('morosos.actualizado', { mes, anio, totalPagados, totalMorosos });
    return {
      procesados:   totalMorosos,
      totalPagados,
      totalMorosos,
      mes, anio, dia,
      mensaje: `${totalMorosos} residentes marcados como pendientes de corte`,
    };
  }
}
