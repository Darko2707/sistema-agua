import { TRPCError } from '@trpc/server';

import { calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { FolioVO } from '@/src/domain/pagos/folio.vo';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { PagoRepository } from '../../ports/pago.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import { logger } from '@/lib/logger';
import type { RegistrarPagoManualCommand } from './registrar-pago-manual.command';
import { eventBus } from '@/src/domain/shared/event-bus';
import { PagoRegistradoEvent } from '@/src/domain/residente/events/pago-registrado.event';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
  circuitoRepo: CircuitoRepository;
};

export type RegistrarPagoManualResult = {
  folio: string;
  monto: string;
  metodo: string;
};

export class RegistrarPagoManualHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: RegistrarPagoManualCommand): Promise<RegistrarPagoManualResult> {
    const { residenteRepo, pagoRepo, circuitoRepo } = this.deps;

    const miCircuito = await circuitoRepo.findByRepresentante(cmd.representanteId);
    if (!miCircuito) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No tienes circuito asignado' });
    }
    if (!miCircuito.activo) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Tu circuito esta inhabilitado' });
    }

    const perfil = await residenteRepo.findById(cmd.perfilId);
    if (!perfil || perfil.circuitoId !== miCircuito.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en tu circuito' });
    }

    const periodo = PeriodoVO.vigente();
    const esReconexion = perfil.estadoAgua === 'cortado';
    const montoBase = calcularMontoBase(miCircuito.montoMensual, esReconexion, miCircuito.montoReconexion);
    const desglose = calcularDesglosePagoManual(montoBase);
    const folio = FolioVO.generate().toString();

    await pagoRepo.createWithLock(perfil.id, {
      perfilId:               perfil.id,
      circuitoId:             miCircuito.id,
      representanteId:        cmd.representanteId,
      mes:                    periodo.mes,
      anio:                   periodo.anio,
      monto:                  desglose.total,
      montoBase:              desglose.montoBase,
      iva:                    desglose.iva,
      comisionMercadoPago:    desglose.comisionMercadoPago,
      retencionIsr:           desglose.retencionIsr,
      retencionIva:           desglose.retencionIva,
      montoNetoRepresentante: desglose.montoNetoRepresentante,
      mercadoPagoCollectorId: miCircuito.mercadoPagoCollectorId,
      estado:                 'pagado',
      metodo:                 cmd.metodo,
      folio,
      esReconexion,
      fechaPago:              new Date(),
    });

    await eventBus.publish([new PagoRegistradoEvent(perfil.id, folio)]);

    logger.info('pago.manual.completado', {
      folio,
      perfilId: perfil.id,
      representanteId: cmd.representanteId,
      mes: periodo.mes,
      anio: periodo.anio,
    });

    return { folio, monto: desglose.total, metodo: cmd.metodo };
  }
}
