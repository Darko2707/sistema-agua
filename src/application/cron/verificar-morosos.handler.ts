import type { ResidenteRepository } from '../ports/residente.repository';
import type { PagoRepository } from '../ports/pago.repository';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
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

    if (dia <= DIA_CORTE) {
      logger.info('morosos.omitido', { dia, diaCorte: DIA_CORTE, mes, anio });
      return {
        procesados: 0, totalPagados: 0, totalMorosos: 0, mes, anio, dia,
        mensaje: `No es día de corte (antes del día ${DIA_CORTE + 1})`,
      };
    }

    // Run in parallel: the UPDATE (with embedded NOT IN subquery) and the pagados
    // count for reporting. They touch different tables and don't depend on each other.
    const [totalMorosos, pagados] = await Promise.all([
      this.deps.residenteRepo.marcarMorososDelMes(mes, anio),
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
