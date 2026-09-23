import {
  COMISION_PORCENTAJE_MP,
  COMISION_FIJA_MP,
  TASA_RETENCION_ISR,
  TASA_RETENCION_IVA,
  MONTO_RECONEXION_DEFAULT,
} from './constants';

export type DesglosePago = {
  montoBase:              string;
  iva:                    string;
  subtotal:               string;
  comisionMercadoPago:    string;
  retencionIsr:           string;
  retencionIva:           string;
  montoNetoRepresentante: string;
  total:                  string;
};

export type ServicioCobroConfig = {
  montoMensual: string | number;
  montoReconexion?: string | number;
  conCorteFisico?: boolean;
};

export type ModalidadCobro = 'mercado_pago' | 'manual';

export type OpcionesDesglose = {
  /** Si es false, la comisión de tarjeta no se suma al importe del residente. */
  repercutirRecargosTarjeta?: boolean;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

function calcularDesgloseMercadoPago(montoBase: number, repercutirRecargos = true): DesglosePago {
  const base     = roundMoney(montoBase);
  // Sin IVA: sistema informal sin registro fiscal ante SAT.
  const subtotal = base;

  // Cuando se repercute, el residente cubre los cargos de MP para que el
  // representante reciba `base` íntegro. Si no se repercute, el residente
  // paga solo la base y el neto refleja el coste real del procesador.
  // T = (base + COMISION_FIJA_MP) / (1 - %comisión - %ISR - %IVA_ret)
  const factorNeto          = 1 - COMISION_PORCENTAJE_MP - TASA_RETENCION_ISR - TASA_RETENCION_IVA;
  const totalBruto          = repercutirRecargos
    ? roundMoney((subtotal + COMISION_FIJA_MP) / factorNeto)
    : base;
  const comisionMercadoPago = roundMoney(totalBruto * COMISION_PORCENTAJE_MP + COMISION_FIJA_MP);
  const retencionIsr        = roundMoney(totalBruto * TASA_RETENCION_ISR);
  const retencionIva        = roundMoney(totalBruto * TASA_RETENCION_IVA);
  const montoNetoRepresentante = roundMoney(totalBruto - comisionMercadoPago - retencionIsr - retencionIva);
  // Sumar los ítems redondeados evita discrepancias de centavo en el comprobante.
  const total = repercutirRecargos
    ? roundMoney(base + comisionMercadoPago + retencionIsr + retencionIva)
    : base;

  return {
    montoBase:              money(base),
    iva:                    '0.00',
    subtotal:               money(subtotal),
    comisionMercadoPago:    money(comisionMercadoPago),
    retencionIsr:           money(retencionIsr),
    retencionIva:           money(retencionIva),
    montoNetoRepresentante: money(montoNetoRepresentante),
    total:                  money(total),
  };
}

function calcularDesgloseManual(montoBase: number): DesglosePago {
  const base = roundMoney(montoBase);
  return {
    montoBase:              money(base),
    iva:                    '0.00',
    subtotal:               money(base),
    comisionMercadoPago:    '0.00',
    retencionIsr:           '0.00',
    retencionIva:           '0.00',
    montoNetoRepresentante: money(base),
    total:                  money(base),
  };
}

/** Calcula el importe base usando la activación del servicio del tenant. */
export function calcularMontoServicio(
  config: ServicioCobroConfig,
  opciones: { incluyeReconexion?: boolean } = {},
): number {
  const incluyeReconexion = opciones.incluyeReconexion === true;
  if (incluyeReconexion && config.conCorteFisico === false) {
    throw new Error('El servicio no permite cobrar reconexión');
  }
  const mensual = Number(config.montoMensual);
  const reconexion = Number(config.montoReconexion ?? MONTO_RECONEXION_DEFAULT);
  if (!Number.isFinite(mensual) || mensual < 0 || !Number.isFinite(reconexion) || reconexion < 0) {
    throw new Error('La configuración del servicio contiene montos inválidos');
  }
  return roundMoney(mensual + (incluyeReconexion ? reconexion : 0));
}

/** Calcula un desglose uniforme para cualquier servicio y modalidad de pago. */
export function calcularDesgloseServicio(
  montoBase: number,
  modalidad: ModalidadCobro,
  opciones: OpcionesDesglose = {},
): DesglosePago {
  return modalidad === 'manual'
    ? calcularDesgloseManual(montoBase)
    : calcularDesgloseMercadoPago(montoBase, opciones.repercutirRecargosTarjeta !== false);
}

// Compatibilidad con los nombres históricos del flujo de agua.
export function calcularDesglosePago(montoBase: number): DesglosePago {
  return calcularDesgloseServicio(montoBase, 'mercado_pago');
}

export function calcularDesglosePagoManual(montoBase: number): DesglosePago {
  return calcularDesgloseServicio(montoBase, 'manual');
}

export function calcularMontoBase(
  montoMensual: string | number,
  esReconexion: boolean,
  montoReconexion: string | number = MONTO_RECONEXION_DEFAULT,
): number {
  return calcularMontoServicio({
    montoMensual,
    montoReconexion,
    conCorteFisico: true,
  }, { incluyeReconexion: esReconexion });
}
