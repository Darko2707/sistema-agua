import { describe, expect, it } from 'vitest';
import { fechaNegocio } from '@/src/domain/shared/fecha-negocio';

describe('fechaNegocio', () => {
  it('mantiene agosto cuando UTC ya avanzo a septiembre pero Mexico aun no', () => {
    expect(fechaNegocio(new Date('2026-09-01T03:00:00.000Z'))).toEqual({
      dia: 31,
      mes: 8,
      anio: 2026,
    });
  });
});
