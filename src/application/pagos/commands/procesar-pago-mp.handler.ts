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

function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function fromCents(value: number): string {
  return (value / 100).toFixed(2);
}

function distributeMoney(total: string, weights: number[]): number[] {
  const totalCents = toCents(total);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let assigned = 0;

  return weights.map((weight, index) => {
    const cents = index === weights.length - 1
      ? totalCents - assigned
      : Math.round(totalCents * weight / totalWeight);
    assigned += cents;
    return cents;
  });
}

export type ProcesarPagoMpResult = {
  folio: string | null;
  folios: string[];
  monto: string;
  esReconexion: boolean;
  yaRegistrado: boolean;
};

export class ProcesarPagoMpHandler {
  constructor(private deps: Deps) {}

  async execute(cmd: ProcesarPagoMpCommand): Promise<ProcesarPagoMpResult> {
    const { residenteRepo, pagoRepo, circuitoRepo } = this.deps;

    if (!cmd.mercadoPagoPaymentId.trim()) {
      throw new Error('El paymentId de Mercado Pago es obligatorio');
    }
    if (cmd.periodos.length < 1 || cmd.periodos.length > 12) {
      throw new Error('Un pago de Mercado Pago debe contener entre 1 y 12 periodos');
    }

    const periodosUnicos = new Set<string>();
    for (const periodo of cmd.periodos) {
      const monto = Number(periodo.monto);
      if (
        !Number.isInteger(periodo.mes) || periodo.mes < 1 || periodo.mes > 12 ||
        !Number.isInteger(periodo.anio) || periodo.anio < 2020 || periodo.anio > 2100 ||
        !Number.isFinite(monto) || monto <= 0
      ) {
        throw new Error('El lote de Mercado Pago contiene un periodo invalido');
      }
      const key = `${periodo.anio}-${periodo.mes}`;
      if (periodosUnicos.has(key)) throw new Error(`Periodo duplicado en el lote: ${key}`);
      periodosUnicos.add(key);
    }

    const perfil = await residenteRepo.findById(cmd.perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');
    if (perfil.circuitoId !== cmd.circuitoId) {
      throw new Error('El perfil cambio de circuito durante la confirmacion del pago');
    }

    const circuito = await circuitoRepo.findById(cmd.circuitoId);
    if (!circuito) throw new Error('Circuito no encontrado');

    // En referencias nuevas los importes vienen congelados en la intencion
    // persistida; en referencias legacy fueron reconstruidos desde la
    // configuracion actual del circuito. La comision fija de MP pertenece al
    // cobro completo, no a cada mes; se calcula una sola vez y se reparte
    // proporcionalmente, dejando el ajuste de centavos al ultimo mes.
    const fechaPago = new Date();
    const bases = cmd.periodos.map(periodo => toCents(periodo.monto));
    const desgloseTotal = calcularDesglosePago(
      bases.reduce((sum, base) => sum + base, 0) / 100,
    );
    const comisiones = distributeMoney(desgloseTotal.comisionMercadoPago, bases);
    const retencionesIsr = distributeMoney(desgloseTotal.retencionIsr, bases);
    const retencionesIva = distributeMoney(desgloseTotal.retencionIva, bases);
    const netos = distributeMoney(desgloseTotal.montoNetoRepresentante, bases);

    const pagos = cmd.periodos.map((periodo, index) => {
      const montoCents = bases[index] + comisiones[index] + retencionesIsr[index] + retencionesIva[index];
      return {
        perfilId:               cmd.perfilId,
        circuitoId:             circuito.id,
        representanteId:        circuito.representanteId,
        mes:                    periodo.mes,
        anio:                   periodo.anio,
        monto:                  fromCents(montoCents),
        montoBase:              fromCents(bases[index]),
        iva:                    '0.00',
        comisionMercadoPago:    fromCents(comisiones[index]),
        retencionIsr:           fromCents(retencionesIsr[index]),
        retencionIva:           fromCents(retencionesIva[index]),
        montoNetoRepresentante: fromCents(netos[index]),
        mercadoPagoPaymentId:   cmd.mercadoPagoPaymentId,
        mercadoPagoCollectorId: cmd.mercadoPagoCollectorId ?? circuito.mercadoPagoCollectorId,
        estado:                 'pagado' as const,
        metodo:                 cmd.metodo,
        folio:                  FolioVO.generate().toString(),
        esReconexion:           periodo.esReconexion,
        fechaPago,
      };
    });

    const result = await pagoRepo.createMercadoPagoBatchWithLock({
      perfilId: cmd.perfilId,
      circuitoId: cmd.circuitoId,
      paymentIntentReference: cmd.paymentIntentReference,
      mercadoPagoPaymentId: cmd.mercadoPagoPaymentId,
      pagos,
      pushNotification: {
        userId: perfil.userId,
        perfilId: perfil.id,
        tipo: 'pago_confirmado',
        mensaje: 'Tu pago fue confirmado. Abre la app para consultar el folio y los detalles.',
        dedupeKey: `pago_confirmado:mp:${cmd.mercadoPagoPaymentId}:${perfil.id}`,
      },
    });

    const folios = result.pagos
      .map(pago => pago.folio)
      .filter((folio): folio is string => Boolean(folio));
    const montoTotal = result.pagos
      .reduce((total, pago) => total + Number(pago.monto), 0)
      .toFixed(2);

    return {
      folio: result.pagos[0]?.folio ?? null,
      folios,
      monto: montoTotal,
      esReconexion: result.pagos.some(pago => pago.esReconexion ?? false),
      yaRegistrado: result.yaRegistrado,
    };
  }
}
