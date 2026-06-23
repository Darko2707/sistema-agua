import { describe, it, expect } from 'vitest';
import {
  calcularDesglosePago,
  calcularDesglosePagoManual,
  calcularMontoBase,
  type DesglosePago,
} from './calculator';
import {
  TASA_IVA,
  COMISION_PORCENTAJE_MP,
  COMISION_FIJA_MP,
  TASA_RETENCION_ISR,
  TASA_RETENCION_IVA,
  MONTO_RECONEXION_DEFAULT,
} from './constants';

// ─── calcularMontoBase ────────────────────────────────────────────────────────

describe('calcularMontoBase', () => {
  it('devuelve el monto mensual cuando no es reconexión', () => {
    expect(calcularMontoBase(100, false)).toBe(100);
    expect(calcularMontoBase(150, false, 300)).toBe(150);
  });

  it('suma el monto de reconexión cuando es reconexión', () => {
    expect(calcularMontoBase(100, true, 300)).toBe(400);
    expect(calcularMontoBase(200, true, 150)).toBe(350);
  });

  it(`usa MONTO_RECONEXION_DEFAULT (${MONTO_RECONEXION_DEFAULT}) cuando es reconexión y no se pasa monto`, () => {
    expect(calcularMontoBase(100, true)).toBe(100 + MONTO_RECONEXION_DEFAULT);
  });

  it('acepta montoMensual como string', () => {
    expect(calcularMontoBase('100.00', false)).toBe(100);
  });

  it('acepta montoReconexion como string', () => {
    expect(calcularMontoBase(100, true, '300.00')).toBe(400);
  });

  it('cuando esReconexion es false ignora el montoReconexion', () => {
    expect(calcularMontoBase(100, false, 9999)).toBe(100);
  });
});

// ─── calcularDesglosePago (Mercado Pago) ──────────────────────────────────────

describe('calcularDesglosePago — Mercado Pago', () => {
  // Valores de referencia para montoBase = 100
  // IVA   = 100 × 0.16 = 16.00
  // sub   = 116.00
  // comMP = 116 × 0.0349 + 4 = 4.0484 + 4 = 8.0484 → 8.05
  // ISR   = 116 × 0.025 = 2.90
  // IVAr  = 116 × 0.08  = 9.28
  // neto  = 116 − 8.05 − 2.90 − 9.28 = 95.77
  const BASE = 100;
  let d: DesglosePago;

  // Computed once so tests are independent of each other
  d = calcularDesglosePago(BASE);

  it('montoBase formateado a 2 decimales', () => {
    expect(calcularDesglosePago(BASE).montoBase).toBe('100.00');
  });

  it(`IVA = montoBase × ${TASA_IVA}`, () => {
    expect(calcularDesglosePago(BASE).iva).toBe('16.00');
  });

  it('subtotal = montoBase + IVA', () => {
    expect(calcularDesglosePago(BASE).subtotal).toBe('116.00');
  });

  it(`comisionMercadoPago = subtotal × ${COMISION_PORCENTAJE_MP} + $${COMISION_FIJA_MP}`, () => {
    expect(calcularDesglosePago(BASE).comisionMercadoPago).toBe('8.05');
  });

  it(`retencionIsr = subtotal × ${TASA_RETENCION_ISR}`, () => {
    expect(calcularDesglosePago(BASE).retencionIsr).toBe('2.90');
  });

  it(`retencionIva = subtotal × ${TASA_RETENCION_IVA}`, () => {
    expect(calcularDesglosePago(BASE).retencionIva).toBe('9.28');
  });

  it('montoNetoRepresentante = subtotal − comisión − retenciones', () => {
    expect(calcularDesglosePago(BASE).montoNetoRepresentante).toBe('95.77');
  });

  it('total es igual al subtotal (lo que cobra el sistema al residente)', () => {
    const result = calcularDesglosePago(BASE);
    expect(result.total).toBe(result.subtotal);
  });

  it('todos los campos tienen exactamente 2 decimales', () => {
    const result = calcularDesglosePago(BASE);
    for (const [campo, valor] of Object.entries(result)) {
      expect(valor, `campo "${campo}"`).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('funciona con otro monto de base (50)', () => {
    const result = calcularDesglosePago(50);
    // 50 × 0.16 = 8.00 → sub = 58.00
    expect(result.iva).toBe('8.00');
    expect(result.subtotal).toBe('58.00');
    expect(result.total).toBe('58.00');
  });

  it('funciona con monto decimal (75.50)', () => {
    const result = calcularDesglosePago(75.5);
    // 75.50 × 0.16 = 12.08 → sub = 87.58
    expect(result.montoBase).toBe('75.50');
    expect(result.iva).toBe('12.08');
    expect(result.subtotal).toBe('87.58');
  });

  it('montoNetoRepresentante es siempre positivo para montos razonables', () => {
    for (const monto of [50, 100, 200, 350, 500]) {
      const result = calcularDesglosePago(monto);
      expect(parseFloat(result.montoNetoRepresentante)).toBeGreaterThan(0);
    }
  });
});

// ─── calcularDesglosePagoManual (efectivo / transferencia) ───────────────────

describe('calcularDesglosePagoManual — efectivo / transferencia', () => {
  const BASE = 100;

  it('montoBase formateado a 2 decimales', () => {
    expect(calcularDesglosePagoManual(BASE).montoBase).toBe('100.00');
  });

  it('IVA es 0.00 (no aplica en pago manual)', () => {
    expect(calcularDesglosePagoManual(BASE).iva).toBe('0.00');
  });

  it('comisionMercadoPago es 0.00', () => {
    expect(calcularDesglosePagoManual(BASE).comisionMercadoPago).toBe('0.00');
  });

  it('retencionIsr es 0.00', () => {
    expect(calcularDesglosePagoManual(BASE).retencionIsr).toBe('0.00');
  });

  it('retencionIva es 0.00', () => {
    expect(calcularDesglosePagoManual(BASE).retencionIva).toBe('0.00');
  });

  it('montoNetoRepresentante es igual al montoBase (representante recibe el 100 %)', () => {
    const result = calcularDesglosePagoManual(BASE);
    expect(result.montoNetoRepresentante).toBe(result.montoBase);
  });

  it('total es igual al montoBase', () => {
    const result = calcularDesglosePagoManual(BASE);
    expect(result.total).toBe(result.montoBase);
  });

  it('subtotal es igual al montoBase', () => {
    const result = calcularDesglosePagoManual(BASE);
    expect(result.subtotal).toBe(result.montoBase);
  });

  it('todos los campos tienen exactamente 2 decimales', () => {
    const result = calcularDesglosePagoManual(BASE);
    for (const [campo, valor] of Object.entries(result)) {
      expect(valor, `campo "${campo}"`).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('funciona con monto decimal (99.50)', () => {
    const result = calcularDesglosePagoManual(99.5);
    expect(result.total).toBe('99.50');
    expect(result.montoNetoRepresentante).toBe('99.50');
  });
});

// ─── Consistencia entre variantes ─────────────────────────────────────────────

describe('consistencia entre calcularDesglosePago y calcularDesglosePagoManual', () => {
  it('el montoBase es idéntico para el mismo monto de entrada', () => {
    const mp     = calcularDesglosePago(100);
    const manual = calcularDesglosePagoManual(100);
    expect(mp.montoBase).toBe(manual.montoBase);
  });

  it('el pago MP siempre recauda más impuestos que el manual', () => {
    const mp     = calcularDesglosePago(100);
    const manual = calcularDesglosePagoManual(100);
    expect(parseFloat(mp.iva)).toBeGreaterThan(parseFloat(manual.iva));
    expect(parseFloat(mp.comisionMercadoPago)).toBeGreaterThan(parseFloat(manual.comisionMercadoPago));
  });

  it('el representante recibe menos en pago MP que en manual (por comisión y retenciones)', () => {
    const mp     = calcularDesglosePago(100);
    const manual = calcularDesglosePagoManual(100);
    expect(parseFloat(mp.montoNetoRepresentante)).toBeLessThan(parseFloat(manual.montoNetoRepresentante));
  });
});
