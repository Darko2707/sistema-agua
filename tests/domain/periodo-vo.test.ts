import { describe, it, expect } from 'vitest';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';

describe('PeriodoVO', () => {
  it('crea un periodo válido', () => {
    const p = PeriodoVO.create(6, 2025);
    expect(p.mes).toBe(6);
    expect(p.anio).toBe(2025);
    expect(p.toString()).toBe('6/2025');
  });

  it('lanza con mes inválido', () => {
    expect(() => PeriodoVO.create(0, 2025)).toThrow();
    expect(() => PeriodoVO.create(13, 2025)).toThrow();
  });

  it('lanza con año inválido', () => {
    expect(() => PeriodoVO.create(1, 2019)).toThrow();
    expect(() => PeriodoVO.create(1, 2101)).toThrow();
  });

  it('dos periodos iguales son equals', () => {
    const a = PeriodoVO.create(6, 2025);
    const b = PeriodoVO.create(6, 2025);
    expect(a.equals(b)).toBe(true);
  });

  it('dos periodos distintos no son equals', () => {
    const a = PeriodoVO.create(6, 2025);
    const b = PeriodoVO.create(7, 2025);
    expect(a.equals(b)).toBe(false);
  });
});
