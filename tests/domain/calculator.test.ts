import { describe, it, expect } from 'vitest';
import { calcularDesglosePago, calcularDesglosePagoManual, calcularMontoBase } from '@/src/domain/pagos/calculator';

describe('calcularDesglosePago', () => {
  it('montoBase y subtotal son iguales (sin IVA — sistema informal sin SAT)', () => {
    const d = calcularDesglosePago(100);
    expect(d.montoBase).toBe('100.00');
    expect(d.iva).toBe('0.00');        // sin IVA por política de negocio
    expect(d.subtotal).toBe('100.00'); // subtotal = base cuando IVA = 0
  });

  it('total > base: el residente absorbe los cargos de Mercado Pago (gross-up)', () => {
    const d = calcularDesglosePago(100);
    expect(parseFloat(d.comisionMercadoPago)).toBeGreaterThan(0);
    expect(parseFloat(d.retencionIsr)).toBeGreaterThan(0);
    expect(parseFloat(d.retencionIva)).toBeGreaterThan(0);
    expect(parseFloat(d.total)).toBeGreaterThan(100);
  });

  it('gross-up: el representante recibe exactamente el montoBase', () => {
    const d = calcularDesglosePago(100);
    // El gross-up garantiza que el neto al representante ≈ base original.
    expect(parseFloat(d.montoNetoRepresentante)).toBeCloseTo(100, 1);
  });

  it('total = base + comision + ISR + IVA retenido (suma de componentes)', () => {
    const d = calcularDesglosePago(100);
    const esperado = parseFloat(d.montoBase)
      + parseFloat(d.comisionMercadoPago)
      + parseFloat(d.retencionIsr)
      + parseFloat(d.retencionIva);
    expect(parseFloat(d.total)).toBeCloseTo(esperado, 1);
  });

  it('funciona con montos no redondos', () => {
    const d = calcularDesglosePago(87.5);
    expect(parseFloat(d.montoBase)).toBeCloseTo(87.5, 2);
    expect(parseFloat(d.montoNetoRepresentante)).toBeCloseTo(87.5, 1);
  });
});

describe('calcularDesglosePagoManual', () => {
  it('sin comisiones — neto = base', () => {
    const d = calcularDesglosePagoManual(100);
    expect(d.iva).toBe('0.00');
    expect(d.comisionMercadoPago).toBe('0.00');
    expect(d.retencionIsr).toBe('0.00');
    expect(d.retencionIva).toBe('0.00');
    expect(d.montoNetoRepresentante).toBe('100.00');
    expect(d.total).toBe('100.00');
  });

  it('subtotal = total = base en pago manual', () => {
    const d = calcularDesglosePagoManual(150);
    expect(d.subtotal).toBe('150.00');
    expect(d.total).toBe('150.00');
  });
});

describe('calcularMontoBase', () => {
  it('sin reconexión devuelve el monto mensual', () => {
    expect(calcularMontoBase(50, false)).toBe(50);
  });

  it('con reconexión suma la tarifa', () => {
    expect(calcularMontoBase(50, true, 300)).toBe(350);
  });

  it('usa MONTO_RECONEXION_DEFAULT si no se provee tarifa', () => {
    const resultado = calcularMontoBase(50, true);
    expect(resultado).toBe(350);
  });

  it('acepta montoMensual como string', () => {
    expect(calcularMontoBase('50', false)).toBe(50);
    expect(calcularMontoBase('50', true, '300')).toBe(350);
  });
});
