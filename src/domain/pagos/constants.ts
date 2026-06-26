export const COMISION_PORCENTAJE_MP = 0.0349;
export const COMISION_FIJA_MP = 4;
export const TASA_RETENCION_ISR = 0.025;
export const TASA_RETENCION_IVA = 0.08;
export const MONTO_RECONEXION_DEFAULT = 300;
export const DIA_CORTE_CIRCUITO_DEFAULT = 5;
export const DIA_CORTE = DIA_CORTE_CIRCUITO_DEFAULT;

export function getDiaCorte(circuito?: { diaCorte?: number | null }): number {
  const dia = circuito?.diaCorte;
  if (typeof dia === 'number' && dia >= 1 && dia <= 28) return dia;
  return DIA_CORTE_CIRCUITO_DEFAULT;
}
