import { calcularDesglosePago } from '@/src/domain/pagos/calculator';
import { FolioVO } from '@/src/domain/pagos/folio.vo';
import type { ResidenteRepository } from '../../ports/residente.repository';
import type { PagoRepository } from '../../ports/pago.repository';
import type { CircuitoRepository } from '../../ports/circuito.repository';
import type { ProcesarPagoMpCommand } from './procesar-pago-mp.command';

type Deps = {
  residenteRepo: ResidenteRepository;
  pagoRepo: PagoRepository;
  circuitoRepo: CircuitoRepository;
};

export type ProcesarPagoMpResult = {
  folio: string | null;
  monto: string;
  esReconexion: boolean;
  yaRegistrado: boolean;
};

export class ProcesarPagoMpHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ProcesarPagoMpCommand): Promise<ProcesarPagoMpResult> {
    const { residenteRepo, pagoRepo, circuitoRepo } = this.deps;

    // Fast-path idempotency check (MP puede reenviar webhooks)
    const existente = await pagoRepo.findByPerfilYMes(cmd.perfilId, cmd.mes, cmd.anio);
    if (existente) {
      return {
        folio:         existente.folio,
        monto:         existente.monto,
        esReconexion:  existente.esReconexion ?? false,
        yaRegistrado:  true,
      };
    }

    const perfil = await residenteRepo.findById(cmd.perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    const circuito = await circuitoRepo.findById(perfil.circuitoId);
    if (!circuito) throw new Error('Circuito no encontrado');

    const montoBase = cmd.esReconexion
      ? Number(circuito.montoMensual) + Number(circuito.montoReconexion)
      : Number(cmd.monto);

    const desglose = calcularDesglosePago(montoBase);
    const folio = FolioVO.generate().toString();

    const pago = await pagoRepo.createWithLock(perfil.id, {
      perfilId:               cmd.perfilId,
      circuitoId:             circuito.id,
      representanteId:        circuito.representanteId,
      mes:                    cmd.mes,
      anio:                   cmd.anio,
      monto:                  desglose.total,
      montoBase:              desglose.montoBase,
      iva:                    desglose.iva,
      comisionMercadoPago:    desglose.comisionMercadoPago,
      retencionIsr:           desglose.retencionIsr,
      retencionIva:           desglose.retencionIva,
      montoNetoRepresentante: desglose.montoNetoRepresentante,
      mercadoPagoPaymentId:   cmd.mercadoPagoPaymentId,
      mercadoPagoCollectorId: cmd.mercadoPagoCollectorId ?? circuito.mercadoPagoCollectorId,
      estado:                 'pagado',
      metodo:                 cmd.metodo,
      folio,
      esReconexion:           cmd.esReconexion,
      fechaPago:              new Date(),
    });

    return {
      folio:        pago.folio,
      monto:        pago.monto,
      esReconexion: pago.esReconexion ?? false,
      yaRegistrado: false,
    };
  }
}
