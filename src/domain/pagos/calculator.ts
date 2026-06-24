import {
  TASA_IVA,
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

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function calcularDesglosePago(montoBase: number): DesglosePago {
  const base     = roundMoney(montoBase);
  // Sin IVA: sistema informal sin registro fiscal ante SAT.
  const subtotal = base;

  // Gross-up: residente cubre los cargos de MP para que el representante reciba `base` íntegro.
  // T = (base + COMISION_FIJA_MP) / (1 - %comisión - %ISR - %IVA_ret)
  const factorNeto          = 1 - COMISION_PORCENTAJE_MP - TASA_RETENCION_ISR - TASA_RETENCION_IVA;
  const totalBruto          = roundMoney((subtotal + COMISION_FIJA_MP) / factorNeto);
  const comisionMercadoPago = roundMoney(totalBruto * COMISION_PORCENTAJE_MP + COMISION_FIJA_MP);
  const retencionIsr        = roundMoney(totalBruto * TASA_RETENCION_ISR);
  const retencionIva        = roundMoney(totalBruto * TASA_RETENCION_IVA);
  const montoNetoRepresentante = roundMoney(totalBruto - comisionMercadoPago - retencionIsr - retencionIva);
  // Sumar los ítems redondeados evita discrepancias de centavo en el comprobante.
  const total = roundMoney(base + comisionMercadoPago + retencionIsr + retencionIva);

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

export function calcularDesglosePagoManual(montoBase: number): DesglosePago {
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

export function calcularMontoBase(
  montoMensual: string | number,
  esReconexion: boolean,
  montoReconexion: string | number = MONTO_RECONEXION_DEFAULT,
): number {
  return Number(montoMensual) + (esReconexion ? Number(montoReconexion) : 0);
}
