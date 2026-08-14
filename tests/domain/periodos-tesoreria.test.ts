import { describe, expect, it } from 'vitest';
import {
  compararPeriodos,
  construirEstadoPagosTesorera,
  periodoDesdeFecha,
  periodoKey,
  type PeriodoCalendario,
} from '@/src/domain/pagos/periodos-tesoreria';

function construir({
  actual,
  inicio,
  pagados = [],
  mesesAdelanto = 2,
}: {
  actual: PeriodoCalendario;
  inicio: PeriodoCalendario | null;
  pagados?: PeriodoCalendario[];
  mesesAdelanto?: number;
}) {
  return construirEstadoPagosTesorera({
    periodoActual: actual,
    periodoInicio: inicio,
    periodosPagados: pagados,
    mesesAdelanto,
  });
}

describe('periodos de tesoreria', () => {
  it('usa mes y anio como identidad exacta y orden cronologico', () => {
    expect(periodoKey({ mes: 2, anio: 2026 })).toBe('2026-02');
    expect(compararPeriodos({ mes: 12, anio: 2025 }, { mes: 1, anio: 2026 })).toBeLessThan(0);
    expect(compararPeriodos({ mes: 1, anio: 2026 }, { mes: 1, anio: 2026 })).toBe(0);
  });

  it('una alta nueva inicia en el periodo actual y no inventa atrasados', () => {
    const resultado = construir({
      actual: { mes: 8, anio: 2026 },
      inicio: null,
    });

    expect(resultado.accionDisponible).toBe('pagar_actual');
    expect(resultado.atrasadosPendientes).toBe(0);
    expect(resultado.periodos).toEqual([
      { mes: 8, anio: 2026, tipo: 'actual', estado: 'disponible' },
      { mes: 9, anio: 2026, tipo: 'adelantado', estado: 'bloqueado' },
      { mes: 10, anio: 2026, tipo: 'adelantado', estado: 'bloqueado' },
    ]);
  });

  it('trata un inicio futuro como una alta del periodo actual', () => {
    const resultado = construir({
      actual: { mes: 8, anio: 2026 },
      inicio: { mes: 10, anio: 2026 },
      mesesAdelanto: 1,
    });

    expect(resultado.periodos).toEqual([
      { mes: 8, anio: 2026, tipo: 'actual', estado: 'disponible' },
      { mes: 9, anio: 2026, tipo: 'adelantado', estado: 'bloqueado' },
    ]);
  });

  it('habilita solamente los meses atrasados impagos cuando existen adeudos', () => {
    const resultado = construir({
      actual: { mes: 3, anio: 2026 },
      inicio: { mes: 1, anio: 2026 },
      mesesAdelanto: 1,
    });

    expect(resultado.accionDisponible).toBe('pagar_atrasados');
    expect(resultado.atrasadosPendientes).toBe(2);
    expect(resultado.periodos).toEqual([
      { mes: 1, anio: 2026, tipo: 'atrasado', estado: 'disponible' },
      { mes: 2, anio: 2026, tipo: 'atrasado', estado: 'disponible' },
      { mes: 3, anio: 2026, tipo: 'actual', estado: 'bloqueado' },
      { mes: 4, anio: 2026, tipo: 'adelantado', estado: 'bloqueado' },
    ]);
  });

  it('detecta un hueco entre pagos y mantiene bloqueados actual y adelantos', () => {
    const resultado = construir({
      actual: { mes: 4, anio: 2026 },
      inicio: { mes: 1, anio: 2026 },
      pagados: [
        { mes: 1, anio: 2026 },
        { mes: 3, anio: 2026 },
        { mes: 4, anio: 2026 },
      ],
      mesesAdelanto: 1,
    });

    expect(resultado.accionDisponible).toBe('pagar_atrasados');
    expect(resultado.atrasadosPendientes).toBe(1);
    expect(resultado.periodos).toEqual([
      { mes: 1, anio: 2026, tipo: 'atrasado', estado: 'pagado' },
      { mes: 2, anio: 2026, tipo: 'atrasado', estado: 'disponible' },
      { mes: 3, anio: 2026, tipo: 'atrasado', estado: 'pagado' },
      { mes: 4, anio: 2026, tipo: 'actual', estado: 'pagado' },
      { mes: 5, anio: 2026, tipo: 'adelantado', estado: 'bloqueado' },
    ]);
  });

  it('habilita solamente el mes actual cuando los anteriores estan pagados', () => {
    const resultado = construir({
      actual: { mes: 3, anio: 2026 },
      inicio: { mes: 1, anio: 2026 },
      pagados: [
        { mes: 1, anio: 2026 },
        { mes: 2, anio: 2026 },
      ],
      mesesAdelanto: 1,
    });

    expect(resultado.accionDisponible).toBe('pagar_actual');
    expect(resultado.atrasadosPendientes).toBe(0);
    expect(resultado.periodos.map(periodo => [periodoKey(periodo), periodo.estado])).toEqual([
      ['2026-01', 'pagado'],
      ['2026-02', 'pagado'],
      ['2026-03', 'disponible'],
      ['2026-04', 'bloqueado'],
    ]);
  });

  it('habilita adelantos impagos cuando el mes actual ya esta pagado', () => {
    const resultado = construir({
      actual: { mes: 3, anio: 2026 },
      inicio: { mes: 1, anio: 2026 },
      pagados: [
        { mes: 1, anio: 2026 },
        { mes: 2, anio: 2026 },
        { mes: 3, anio: 2026 },
      ],
    });

    expect(resultado.accionDisponible).toBe('adelantar');
    expect(resultado.periodos.slice(-2)).toEqual([
      { mes: 4, anio: 2026, tipo: 'adelantado', estado: 'disponible' },
      { mes: 5, anio: 2026, tipo: 'adelantado', estado: 'disponible' },
    ]);
  });

  it('mantiene pagados los adelantos exactos y habilita los siguientes', () => {
    const resultado = construir({
      actual: { mes: 3, anio: 2026 },
      inicio: { mes: 3, anio: 2026 },
      pagados: [
        { mes: 3, anio: 2026 },
        { mes: 4, anio: 2026 },
        { mes: 4, anio: 2025 },
      ],
    });

    expect(resultado.periodos).toEqual([
      { mes: 3, anio: 2026, tipo: 'actual', estado: 'pagado' },
      { mes: 4, anio: 2026, tipo: 'adelantado', estado: 'pagado' },
      { mes: 5, anio: 2026, tipo: 'adelantado', estado: 'disponible' },
      { mes: 6, anio: 2026, tipo: 'adelantado', estado: 'disponible' },
    ]);
  });

  it('ofrece doce adelantos impagos aunque existan meses futuros ya pagados', () => {
    const resultado = construirEstadoPagosTesorera({
      periodoActual: { mes: 8, anio: 2026 },
      periodoInicio: null,
      periodosPagados: [
        { mes: 8, anio: 2026 },
        { mes: 9, anio: 2026 },
        { mes: 11, anio: 2026 },
      ],
    });
    const adelantos = resultado.periodos.filter(periodo => periodo.tipo === 'adelantado');

    expect(resultado.accionDisponible).toBe('adelantar');
    expect(adelantos.filter(periodo => periodo.estado === 'disponible')).toHaveLength(12);
    expect(adelantos.filter(periodo => periodo.estado === 'pagado')).toEqual([
      { mes: 9, anio: 2026, tipo: 'adelantado', estado: 'pagado' },
      { mes: 11, anio: 2026, tipo: 'adelantado', estado: 'pagado' },
    ]);
    expect(adelantos.at(-1)).toEqual({
      mes: 10,
      anio: 2027,
      tipo: 'adelantado',
      estado: 'disponible',
    });
  });

  it('cruza de diciembre a enero sin mezclar el anio', () => {
    const resultado = construir({
      actual: { mes: 12, anio: 2026 },
      inicio: { mes: 12, anio: 2026 },
      pagados: [{ mes: 12, anio: 2026 }],
      mesesAdelanto: 2,
    });

    expect(resultado.accionDisponible).toBe('adelantar');
    expect(resultado.periodos).toEqual([
      { mes: 12, anio: 2026, tipo: 'actual', estado: 'pagado' },
      { mes: 1, anio: 2027, tipo: 'adelantado', estado: 'disponible' },
      { mes: 2, anio: 2027, tipo: 'adelantado', estado: 'disponible' },
    ]);
  });

  it('incluye doce meses de adelanto de forma predeterminada', () => {
    const resultado = construirEstadoPagosTesorera({
      periodoActual: { mes: 1, anio: 2027 },
      periodoInicio: null,
      periodosPagados: [],
    });

    expect(resultado.periodos).toHaveLength(13);
    expect(resultado.periodos.at(-1)).toEqual({
      mes: 1,
      anio: 2028,
      tipo: 'adelantado',
      estado: 'bloqueado',
    });
  });

  it('limita el inicio a enero de 2020', () => {
    const resultado = construir({
      actual: { mes: 2, anio: 2020 },
      inicio: { mes: 11, anio: 2019 },
      mesesAdelanto: 0,
    });

    expect(resultado.periodos.map(periodoKey)).toEqual(['2020-01', '2020-02']);
  });

  it('convierte una fecha con el calendario de Mexico', () => {
    const fallback = { mes: 8, anio: 2026 };

    expect(periodoDesdeFecha(new Date('2027-01-01T05:59:00.000Z'), fallback)).toEqual({
      mes: 12,
      anio: 2026,
    });
    expect(periodoDesdeFecha(new Date('2027-01-01T06:00:00.000Z'), fallback)).toEqual({
      mes: 1,
      anio: 2027,
    });
  });

  it('usa una copia del fallback cuando la fecha es null', () => {
    const fallback = Object.create({ mes: 8, anio: 2026 }) as PeriodoCalendario;
    const resultado = periodoDesdeFecha(null, fallback);

    expect(resultado).toEqual({ mes: 8, anio: 2026 });
    expect(resultado).not.toBe(fallback);
  });
});
