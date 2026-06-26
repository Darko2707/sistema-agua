import { TRPCError } from '@trpc/server';
import type { PagoRepository } from '../../ports/pago.repository';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { HistorialPagosQuery } from './historial-pagos.query';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { calcularDesglosePago, calcularMontoBase } from '@/src/domain/pagos/calculator';

type Deps = {
  pagoRepo: PagoRepository;
  residenteRepo: ResidenteRepository;
};

export class HistorialPagosHandler {
  constructor(private deps: Deps) {}

  async execute(query: HistorialPagosQuery) {
    const { pagoRepo, residenteRepo } = this.deps;

    const perfil = await residenteRepo.findByUserId(query.perfilId);
    if (!perfil) {
      return { perfil: null, circuito: null, pagos: [], corteActivo: false, esMoroso: false, mes: null, anio: null };
    }

    const historial = await pagoRepo.findByPerfilId(perfil.id, query.limit ?? 12);
    const corteActivo = await pagoRepo.findCorteActivo(perfil.id);
    const periodo = PeriodoVO.vigente();
    const hoy = new Date().getDate();
    const vencido = hoy > DIA_CORTE;
    const esMoroso = vencido && !historial.some(
      p => p.mes === periodo.mes && p.anio === periodo.anio && p.estado === 'pagado'
    );
    const diasVencido = esMoroso ? hoy - DIA_CORTE : 0;

    const esReconexion  = perfil.estadoAgua === 'cortado';
    const montoBase     = calcularMontoBase(
      perfil.circuito?.montoMensual ?? '50',
      esReconexion,
      perfil.circuito?.montoReconexion ?? '300',
    );
    const desgloseVigente = calcularDesglosePago(montoBase);

    return {
      perfil,
      circuito: perfil.circuito ?? null,
      pagos: historial,
      corteActivo: corteActivo ?? null,
      esMoroso,
      diasVencido,
      mes: periodo.mes,
      anio: periodo.anio,
      desgloseVigente,
    };
  }

  async executeByPerfilId(perfilId: string) {
    const pagos = await this.deps.pagoRepo.findByPerfilId(perfilId);
    return pagos;
  }
}
