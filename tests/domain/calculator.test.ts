import { describe, it, expect } from 'vitest';
import { calcularDesglosePago, calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';

describe('calcularDesglosePago', () => {
  it('calcula correctamente con monto 100', () => {
    const d = calcularDesglosePago(100);
    expect(d.montoBase).toBe('100.00');
    expect(d.iva).toBe('16.00');
    expect(d.subtotal).toBe('116.00');
    expect(parseFloat(d.comisionMercadoPago)).toBeGreaterThan(0);
    expect(parseFloat(d.montoNetoRepresentante)).toBeLessThan(116);
    expect(d.total).toBe(d.subtotal);
  });

  it('montoNetoRepresentante = subtotal - comision - ISR - IVA retenido', () => {
    const d = calcularDesglosePago(100);
    const neto = parseFloat(d.subtotal)
      - parseFloat(d.comisionMercadoPago)
      - parseFloat(d.retencionIsr)
      - parseFloat(d.retencionIva);
    expect(parseFloat(d.montoNetoRepresentante)).toBeCloseTo(neto, 2);
  });
});

describe('calcularDesglosePagoManual', () => {
  it('sin IVA ni comisiones — neto = base', () => {
    const d = calcularDesglosePagoManual(100);
    expect(d.iva).toBe('0.00');
    expect(d.comisionMercadoPago).toBe('0.00');
    expect(d.montoNetoRepresentante).toBe('100.00');
    expect(d.total).toBe('100.00');
  });
});

describe('calcularMontoBase', () => {
  it('sin reconexión devuelve el monto mensual', () => {
    expect(calcularMontoBase(50, false)).toBe(50);
  });

  it('con reconexión suma la tarifa', () => {
    expect(calcularMontoBase(50, true, 300)).toBe(350);
  });

  it('usa MONTO_RECONEXION_DEFAULT si no se provee', () => {
    const resultado = calcularMontoBase(50, true);
    expect(resultado).toBe(350);
  });
});
