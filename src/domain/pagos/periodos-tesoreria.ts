import { fechaNegocio } from '@/src/domain/shared/fecha-negocio';

export type PeriodoCalendario = {
  mes: number;
  anio: number;
};

export type TipoPeriodoTesorera = 'atrasado' | 'actual' | 'adelantado';
export type EstadoPeriodoTesorera = 'pagado' | 'disponible' | 'bloqueado';
export type AccionPagoTesorera = 'pagar_atrasados' | 'pagar_actual' | 'adelantar';

export type PeriodoPagoTesorera = PeriodoCalendario & {
  tipo: TipoPeriodoTesorera;
  estado: EstadoPeriodoTesorera;
};

const PRIMER_PERIODO_PERMITIDO: PeriodoCalendario = { mes: 1, anio: 2020 };
export const MAX_MESES_POR_PAGO_TESORERA = 12;

function indicePeriodo(periodo: PeriodoCalendario): number {
  return periodo.anio * 12 + periodo.mes - 1;
}

function periodoDesdeIndice(indice: number): PeriodoCalendario {
  return {
    mes: (indice % 12) + 1,
    anio: Math.floor(indice / 12),
  };
}

function sumarMeses(periodo: PeriodoCalendario, cantidad: number): PeriodoCalendario {
  return periodoDesdeIndice(indicePeriodo(periodo) + cantidad);
}

export function periodoKey(periodo: PeriodoCalendario): string {
  return `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
}

export function compararPeriodos(a: PeriodoCalendario, b: PeriodoCalendario): number {
  return indicePeriodo(a) - indicePeriodo(b);
}

export function periodoDesdeFecha(
  fecha: Date | null,
  fallback: PeriodoCalendario,
): PeriodoCalendario {
  if (!fecha) return { mes: fallback.mes, anio: fallback.anio };

  const periodo = fechaNegocio(fecha);
  return { mes: periodo.mes, anio: periodo.anio };
}

export function construirEstadoPagosTesorera({
  periodoActual,
  periodoInicio,
  periodosPagados,
  mesesAdelanto = MAX_MESES_POR_PAGO_TESORERA,
}: {
  periodoActual: PeriodoCalendario;
  periodoInicio: PeriodoCalendario | null;
  periodosPagados: readonly PeriodoCalendario[];
  mesesAdelanto?: number;
}): {
  accionDisponible: AccionPagoTesorera;
  atrasadosPendientes: number;
  periodos: PeriodoPagoTesorera[];
} {
  if (!Number.isInteger(mesesAdelanto) || mesesAdelanto < 0) {
    throw new RangeError('mesesAdelanto debe ser un entero mayor o igual a cero');
  }

  const inicioSolicitado = periodoInicio && compararPeriodos(periodoInicio, periodoActual) <= 0
    ? periodoInicio
    : periodoActual;
  const inicio = compararPeriodos(inicioSolicitado, PRIMER_PERIODO_PERMITIDO) < 0
    ? PRIMER_PERIODO_PERMITIDO
    : inicioSolicitado;
  const pagados = new Set(periodosPagados.map(periodoKey));
  let fin = periodoActual;
  let adelantosDisponibles = 0;

  // `mesesAdelanto` representa cuantos periodos impagos debe poder elegir la
  // tesorera. Si ya existen adelantos pagados, se conservan visibles y
  // bloqueados, pero se extiende el calendario hasta ofrecer la misma cantidad
  // de periodos disponibles. El limite de iteraciones es finito porque cada
  // hueco adicional necesariamente corresponde a una clave pagada del Set.
  const maximoIteraciones = mesesAdelanto + pagados.size;
  for (let offset = 1; adelantosDisponibles < mesesAdelanto && offset <= maximoIteraciones; offset += 1) {
    const candidato = sumarMeses(periodoActual, offset);
    fin = candidato;
    if (!pagados.has(periodoKey(candidato))) adelantosDisponibles += 1;
  }

  const periodosBase: Array<PeriodoCalendario & { tipo: TipoPeriodoTesorera; pagado: boolean }> = [];
  for (
    let indice = indicePeriodo(inicio);
    indice <= indicePeriodo(fin);
    indice += 1
  ) {
    const periodo = periodoDesdeIndice(indice);
    const comparacion = compararPeriodos(periodo, periodoActual);
    periodosBase.push({
      ...periodo,
      tipo: comparacion < 0 ? 'atrasado' : comparacion === 0 ? 'actual' : 'adelantado',
      pagado: pagados.has(periodoKey(periodo)),
    });
  }

  const atrasadosPendientes = periodosBase.filter(
    periodo => periodo.tipo === 'atrasado' && !periodo.pagado,
  ).length;
  const actualPagado = periodosBase.some(
    periodo => periodo.tipo === 'actual' && periodo.pagado,
  );
  const accionDisponible: AccionPagoTesorera = atrasadosPendientes > 0
    ? 'pagar_atrasados'
    : actualPagado
      ? 'adelantar'
      : 'pagar_actual';

  const periodos: PeriodoPagoTesorera[] = periodosBase.map(({ pagado, ...periodo }) => {
    if (pagado) return { ...periodo, estado: 'pagado' };

    const disponible =
      (accionDisponible === 'pagar_atrasados' && periodo.tipo === 'atrasado') ||
      (accionDisponible === 'pagar_actual' && periodo.tipo === 'actual') ||
      (accionDisponible === 'adelantar' && periodo.tipo === 'adelantado');

    return { ...periodo, estado: disponible ? 'disponible' : 'bloqueado' };
  });

  return { accionDisponible, atrasadosPendientes, periodos };
}
