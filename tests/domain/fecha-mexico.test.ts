import { describe, expect, it } from 'vitest';
import { fechaNegocio, sumarDiasFechaNegocio } from '@/src/domain/shared/fecha-negocio';

describe('fechaNegocio', () => {
  it('mantiene agosto cuando UTC ya avanzo a septiembre pero Mexico aun no', () => {
    expect(fechaNegocio(new Date('2026-09-01T03:00:00.000Z'))).toEqual({
      dia: 31,
      mes: 8,
      anio: 2026,
    });
  });
});

describe('sumarDiasFechaNegocio', () => {
  it('cruza correctamente de mes y de año', () => {
    expect(sumarDiasFechaNegocio({ dia: 31, mes: 12, anio: 2026 }, 1)).toEqual({
      dia: 1,
      mes: 1,
      anio: 2027,
    });
  });

  it('rechaza cantidades fraccionarias', () => {
    expect(() => sumarDiasFechaNegocio({ dia: 1, mes: 1, anio: 2026 }, 0.5)).toThrow();
  });
});
