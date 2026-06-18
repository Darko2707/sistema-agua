// server/utils/fechas.ts
export function determinarEstadoInicial(): 'activo' | 'pendiente_corte' {
  const DIA_CORTE = 5;
  const ahora = new Date();
  const dia = ahora.getDate();

  // Si es después del día 5, debe pagar el mes
  return dia > DIA_CORTE ? 'pendiente_corte' : 'activo';
}