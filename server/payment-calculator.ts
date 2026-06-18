export const MONTO_RECONEXION = 300;

export type DesglosePago = {
  montoBase: string;
  iva: string;
  subtotal: string;
  comisionMercadoPago: string;
  retencionIsr: string;
  retencionIva: string;
  montoNetoRepresentante: string;
  total: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number) {
  return roundMoney(value).toFixed(2);
}

export function calcularDesglosePago(montoBase: number): DesglosePago {
  const base = roundMoney(montoBase);
  const iva = roundMoney(base * 0.16);
  const subtotal = roundMoney(base + iva);
  const comisionMercadoPago = roundMoney(subtotal * 0.0349 + 4);
  const retencionIsr = roundMoney(subtotal * 0.025);
  const retencionIva = roundMoney(subtotal * 0.08);
  const montoNetoRepresentante = roundMoney(
    subtotal - comisionMercadoPago - retencionIsr - retencionIva
  );

  return {
    montoBase: money(base),
    iva: money(iva),
    subtotal: money(subtotal),
    comisionMercadoPago: money(comisionMercadoPago),
    retencionIsr: money(retencionIsr),
    retencionIva: money(retencionIva),
    montoNetoRepresentante: money(montoNetoRepresentante),
    total: money(subtotal),
  };
}

export function calcularMontoBase(
  montoMensual: string | number,
  esReconexion: boolean,
  montoReconexion: string | number = MONTO_RECONEXION
) {
  return Number(montoMensual) + (esReconexion ? Number(montoReconexion) : 0);
}
