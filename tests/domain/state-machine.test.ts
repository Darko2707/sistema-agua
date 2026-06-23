import { describe, it, expect } from 'vitest';
import {
  ACCIONES,
  ESTADOS,
  aplicarTransicion,
  puedeTransicionar,
  transicionesDisponibles,
  type EstadoAgua,
} from '@/src/domain/agua/state-machine';

const FECHA = new Date('2025-06-15T10:00:00Z');
const ctx   = { fecha: FECHA };
const ctxConActor = { fecha: FECHA, actorId: 'trabajador-001' };

describe('aplicarTransicion — transiciones válidas', () => {
  it('activo → pendiente_corte (MARCAR_MOROSO)', () => {
    const r = aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.MARCAR_MOROSO, ctx);
    expect(r.nuevoEstado).toBe(ESTADOS.PENDIENTE_CORTE);
    expect(r.efectos).toHaveLength(0);
  });

  it('pendiente_corte → activo (PAGAR_PENDIENTE)', () => {
    const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.PAGAR_PENDIENTE, ctx);
    expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    expect(r.efectos).toHaveLength(0);
  });

  it('pendiente_corte → cortado (EJECUTAR_CORTE) genera efecto crear_corte', () => {
    const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
    expect(r.nuevoEstado).toBe(ESTADOS.CORTADO);
    expect(r.efectos).toHaveLength(1);
    expect(r.efectos[0].tipo).toBe('crear_corte');
    if (r.efectos[0].tipo === 'crear_corte') {
      expect(r.efectos[0].trabajadorId).toBe('trabajador-001');
      expect(r.efectos[0].motivo).toBe('falta_pago');
    }
  });

  it('cortado → pendiente_reconexion (PAGAR_RECONEXION) genera efecto cerrar_corte', () => {
    const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.PAGAR_RECONEXION, ctx);
    expect(r.nuevoEstado).toBe(ESTADOS.PENDIENTE_RECONEXION);
    expect(r.efectos[0].tipo).toBe('cerrar_corte');
  });

  it('cortado → activo (RECONEXION_DIRECTA) genera efecto cerrar_corte', () => {
    const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.RECONEXION_DIRECTA, ctxConActor);
    expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    if (r.efectos[0].tipo === 'cerrar_corte') {
      expect(r.efectos[0].reconectadoPor).toBe('trabajador-001');
    }
  });

  it('pendiente_reconexion → activo (EJECUTAR_RECONEXION)', () => {
    const r = aplicarTransicion(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_RECONEXION, ctxConActor);
    expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    expect(r.efectos[0].tipo).toBe('cerrar_corte');
  });
});

describe('aplicarTransicion — transiciones inválidas', () => {
  it('lanza en activo + PAGAR_PENDIENTE', () => {
    expect(() => aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.PAGAR_PENDIENTE, ctx)).toThrow();
  });

  it('lanza en cortado + MARCAR_MOROSO', () => {
    expect(() => aplicarTransicion(ESTADOS.CORTADO, ACCIONES.MARCAR_MOROSO, ctx)).toThrow();
  });

  it('lanza en pendiente_reconexion + EJECUTAR_CORTE', () => {
    expect(() => aplicarTransicion(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_CORTE, ctx)).toThrow();
  });
});

describe('puedeTransicionar', () => {
  it('activo + MARCAR_MOROSO → true', () => {
    expect(puedeTransicionar(ESTADOS.ACTIVO, ACCIONES.MARCAR_MOROSO)).toBe(true);
  });

  it('activo + PAGAR_PENDIENTE → false', () => {
    expect(puedeTransicionar(ESTADOS.ACTIVO, ACCIONES.PAGAR_PENDIENTE)).toBe(false);
  });
});

describe('transicionesDisponibles', () => {
  it('activo tiene exactamente MARCAR_MOROSO', () => {
    const t = transicionesDisponibles(ESTADOS.ACTIVO);
    expect(t).toHaveLength(1);
    expect(t[0].accion).toBe(ACCIONES.MARCAR_MOROSO);
    expect(t[0].destino).toBe(ESTADOS.PENDIENTE_CORTE);
  });

  it('pendiente_corte tiene dos transiciones', () => {
    const t = transicionesDisponibles(ESTADOS.PENDIENTE_CORTE);
    expect(t).toHaveLength(2);
  });
});
