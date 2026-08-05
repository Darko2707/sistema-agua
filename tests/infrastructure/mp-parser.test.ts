import { describe, it, expect } from 'vitest';
import { expandExternalReference, parseExternalReference } from '@/src/infrastructure/mercadopago/parser';

const VALID = 'agua|perf-abc|6|2025|0|125.50';

describe('parseExternalReference', () => {
  it('parsea una referencia válida', () => {
    expect(parseExternalReference(VALID)).toEqual({
      perfilId:     'perf-abc',
      mes:          6,
      anio:         2025,
      esReconexion: false,
      monto:        '125.50',
    });
  });

  it('esReconexion "1" → true', () => {
    const ref = parseExternalReference('agua|perf-abc|6|2025|1|125.50');
    expect(ref?.esReconexion).toBe(true);
  });

  it('esReconexion "0" → false', () => {
    expect(parseExternalReference(VALID)?.esReconexion).toBe(false);
  });

  it('normaliza monto a dos decimales', () => {
    expect(parseExternalReference('agua|perf-abc|6|2025|0|100')?.monto).toBe('100.00');
    expect(parseExternalReference('agua|perf-abc|6|2025|0|99.9')?.monto).toBe('99.90');
  });

  it('null para entrada null / undefined / vacía', () => {
    expect(parseExternalReference(null)).toBeNull();
    expect(parseExternalReference(undefined)).toBeNull();
    expect(parseExternalReference('')).toBeNull();
  });

  it('null si el prefijo no es "agua"', () => {
    expect(parseExternalReference('AGUA|perf-abc|6|2025|0|100')).toBeNull();
    expect(parseExternalReference('test|perf-abc|6|2025|0|100')).toBeNull();
  });

  it('null si faltan partes', () => {
    expect(parseExternalReference('agua|perf-abc|6|2025|0')).toBeNull();
    expect(parseExternalReference('agua|perf-abc|6|2025')).toBeNull();
    expect(parseExternalReference('agua|perf-abc|6|2025|0|100|extra')).toBeNull();
  });

  it('null si mes está fuera de rango', () => {
    expect(parseExternalReference('agua|perf-abc|0|2025|0|100')).toBeNull();
    expect(parseExternalReference('agua|perf-abc|13|2025|0|100')).toBeNull();
  });

  it('null si anio está fuera de rango', () => {
    expect(parseExternalReference('agua|perf-abc|6|2019|0|100')).toBeNull();
    expect(parseExternalReference('agua|perf-abc|6|2101|0|100')).toBeNull();
  });

  it('null si monto es cero o negativo', () => {
    expect(parseExternalReference('agua|perf-abc|6|2025|0|0')).toBeNull();
    expect(parseExternalReference('agua|perf-abc|6|2025|0|-50')).toBeNull();
  });

  it('null si monto no es un número', () => {
    expect(parseExternalReference('agua|perf-abc|6|2025|0|abc')).toBeNull();
  });
  it('parsea referencia v2 de meses adelantados', () => {
    expect(parseExternalReference('agua2|perf-abc|11|2026|3|0|100|0')).toEqual({
      perfilId:         'perf-abc',
      mes:              11,
      anio:             2026,
      esReconexion:     false,
      monto:            '300.00',
      mesesAdelantados: 3,
      montoMensual:     '100.00',
      montoReconexion:  '0.00',
    });
  });

  it('expande meses adelantados cruzando de anio', () => {
    const ref = parseExternalReference('agua2|perf-abc|11|2026|3|0|100|0');
    expect(ref && expandExternalReference(ref)).toEqual([
      { perfilId: 'perf-abc', mes: 11, anio: 2026, esReconexion: false, monto: '100.00' },
      { perfilId: 'perf-abc', mes: 12, anio: 2026, esReconexion: false, monto: '100.00' },
      { perfilId: 'perf-abc', mes: 1, anio: 2027, esReconexion: false, monto: '100.00' },
    ]);
  });
});
