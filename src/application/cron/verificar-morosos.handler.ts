import type { ResidenteRepository } from '../ports/residente.repository';
import type { PagoRepository } from '../ports/pago.repository';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { logger } from '@/lib/logger';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
};

export class VerificarMorososHandler {
  constructor(private deps: Deps) {}

  async execute() {
    const ahora = new Date();
    const dia   = ahora.getDate();
    const mes   = ahora.getMonth() + 1;
    const anio  = ahora.getFullYear();

    if (dia <= DIA_CORTE) {
      logger.info('morosos.omitido', { dia, diaCorte: DIA_CORTE, mes, anio });
      return {
        procesados: 0, totalPagados: 0, totalMorosos: 0, mes, anio, dia,
        mensaje: `No es día de corte (antes del día ${DIA_CORTE + 1})`,
      };
    }

    const pagados = await this.deps.pagoRepo.findPagadosByMes(mes, anio);
    const idsPagados = pagados.map(p => p.perfilId);
    const activos = await this.deps.residenteRepo.findByEstado('activo');
    const morosos = activos.filter(p => !idsPagados.includes(p.id));

    for (const moroso of morosos) {
      await this.deps.residenteRepo.updateEstado(moroso.id, 'pendiente_corte');
    }

    logger.info('morosos.actualizado', { mes, anio, totalPagados: pagados.length, totalMorosos: morosos.length });
    return {
      procesados:   morosos.length,
      totalPagados: pagados.length,
      totalMorosos: morosos.length,
      mes, anio, dia,
      mensaje: `${morosos.length} residentes marcados como pendientes de corte`,
    };
  }
}
