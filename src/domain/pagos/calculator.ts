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
  const base                   = roundMoney(montoBase);
  const iva                    = roundMoney(base * TASA_IVA);
  const subtotal               = roundMoney(base + iva);
  const comisionMercadoPago    = roundMoney(subtotal * COMISION_PORCENTAJE_MP + COMISION_FIJA_MP);
  const retencionIsr           = roundMoney(subtotal * TASA_RETENCION_ISR);
  const retencionIva           = roundMoney(subtotal * TASA_RETENCION_IVA);
  const montoNetoRepresentante = roundMoney(
    subtotal - comisionMercadoPago - retencionIsr - retencionIva,
  );
  return {
    montoBase:              money(base),
    iva:                    money(iva),
    subtotal:               money(subtotal),
    comisionMercadoPago:    money(comisionMercadoPago),
    retencionIsr:           money(retencionIsr),
    retencionIva:           money(retencionIva),
    montoNetoRepresentante: money(montoNetoRepresentante),
    total:                  money(subtotal),
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
