import { describe, it, expect } from 'vitest';
import {
  ACCIONES,
  ESTADOS,
  aplicarTransicion,
  puedeTransicionar,
  transicionesDisponibles,
  type EstadoAgua,
  type AccionEstado,
} from './state-machine';

const FECHA = new Date('2025-06-15T10:00:00Z');
const ctx   = { fecha: FECHA };
const ctxConActor = { fecha: FECHA, actorId: 'trabajador-001' };

// ─── aplicarTransicion: transiciones válidas ──────────────────────────────

describe('aplicarTransicion — transiciones válidas', () => {
  describe('activo → pendiente_corte (MARCAR_MOROSO)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.MARCAR_MOROSO, ctx);
      expect(r.nuevoEstado).toBe(ESTADOS.PENDIENTE_CORTE);
    });
    it('no genera efectos secundarios', () => {
      const r = aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.MARCAR_MOROSO, ctx);
      expect(r.efectos).toHaveLength(0);
    });
  });

  describe('pendiente_corte → activo (PAGAR_PENDIENTE)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.PAGAR_PENDIENTE, ctx);
      expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    });
    it('no genera efectos secundarios', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.PAGAR_PENDIENTE, ctx);
      expect(r.efectos).toHaveLength(0);
    });
  });

  describe('pendiente_corte → cortado (EJECUTAR_CORTE)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
      expect(r.nuevoEstado).toBe(ESTADOS.CORTADO);
    });
    it('genera efecto crear_corte', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
      expect(r.efectos).toHaveLength(1);
      expect(r.efectos[0].tipo).toBe('crear_corte');
    });
    it('el efecto contiene trabajadorId del contexto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
      const efecto = r.efectos[0] as { tipo: 'crear_corte'; trabajadorId: string };
      expect(efecto.trabajadorId).toBe('trabajador-001');
    });
    it('el efecto contiene motivo falta_pago', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
      const efecto = r.efectos[0] as { tipo: 'crear_corte'; motivo: string };
      expect(efecto.motivo).toBe('falta_pago');
    });
    it('el efecto contiene la fecha del contexto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctxConActor);
      const efecto = r.efectos[0] as { tipo: 'crear_corte'; fecha: Date };
      expect(efecto.fecha).toBe(FECHA);
    });
    it('usa string vacío cuando actorId no está en contexto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE, ctx);
      const efecto = r.efectos[0] as { tipo: 'crear_corte'; trabajadorId: string };
      expect(efecto.trabajadorId).toBe('');
    });
  });

  describe('cortado → pendiente_reconexion (PAGAR_RECONEXION)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.PAGAR_RECONEXION, ctx);
      expect(r.nuevoEstado).toBe(ESTADOS.PENDIENTE_RECONEXION);
    });
    it('genera efecto cerrar_corte', () => {
      const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.PAGAR_RECONEXION, ctx);
      expect(r.efectos).toHaveLength(1);
      expect(r.efectos[0].tipo).toBe('cerrar_corte');
    });
    it('el efecto NO incluye reconectadoPor (lo cerrará la cuadrilla)', () => {
      const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.PAGAR_RECONEXION, ctxConActor);
      const efecto = r.efectos[0] as { tipo: 'cerrar_corte'; reconectadoPor?: string };
      expect(efecto.reconectadoPor).toBeUndefined();
    });
  });

  describe('pendiente_reconexion → activo (EJECUTAR_RECONEXION)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_RECONEXION, ctxConActor);
      expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    });
    it('genera efecto cerrar_corte con reconectadoPor', () => {
      const r = aplicarTransicion(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_RECONEXION, ctxConActor);
      expect(r.efectos).toHaveLength(1);
      const efecto = r.efectos[0] as { tipo: 'cerrar_corte'; reconectadoPor?: string };
      expect(efecto.tipo).toBe('cerrar_corte');
      expect(efecto.reconectadoPor).toBe('trabajador-001');
    });
  });

  describe('cortado → activo (RECONEXION_DIRECTA — admin override)', () => {
    it('devuelve el estado correcto', () => {
      const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.RECONEXION_DIRECTA, ctxConActor);
      expect(r.nuevoEstado).toBe(ESTADOS.ACTIVO);
    });
    it('genera efecto cerrar_corte con reconectadoPor', () => {
      const r = aplicarTransicion(ESTADOS.CORTADO, ACCIONES.RECONEXION_DIRECTA, ctxConActor);
      expect(r.efectos).toHaveLength(1);
      const efecto = r.efectos[0] as { tipo: 'cerrar_corte'; reconectadoPor?: string };
      expect(efecto.tipo).toBe('cerrar_corte');
      expect(efecto.reconectadoPor).toBe('trabajador-001');
    });
  });
});

// ─── aplicarTransicion: transiciones inválidas ───────────────────────────────

describe('aplicarTransicion — transiciones inválidas', () => {
  const CASOS_INVALIDOS: Array<[EstadoAgua, AccionEstado]> = [
    // Desde activo solo se puede MARCAR_MOROSO
    [ESTADOS.ACTIVO,               ACCIONES.EJECUTAR_CORTE],
    [ESTADOS.ACTIVO,               ACCIONES.PAGAR_RECONEXION],
    [ESTADOS.ACTIVO,               ACCIONES.EJECUTAR_RECONEXION],
    [ESTADOS.ACTIVO,               ACCIONES.PAGAR_PENDIENTE],
    [ESTADOS.ACTIVO,               ACCIONES.RECONEXION_DIRECTA],
    // Desde pendiente_corte solo PAGAR_PENDIENTE o EJECUTAR_CORTE
    [ESTADOS.PENDIENTE_CORTE,      ACCIONES.MARCAR_MOROSO],
    [ESTADOS.PENDIENTE_CORTE,      ACCIONES.PAGAR_RECONEXION],
    [ESTADOS.PENDIENTE_CORTE,      ACCIONES.EJECUTAR_RECONEXION],
    [ESTADOS.PENDIENTE_CORTE,      ACCIONES.RECONEXION_DIRECTA],
    // Desde cortado solo PAGAR_RECONEXION o RECONEXION_DIRECTA
    [ESTADOS.CORTADO,              ACCIONES.MARCAR_MOROSO],
    [ESTADOS.CORTADO,              ACCIONES.PAGAR_PENDIENTE],
    [ESTADOS.CORTADO,              ACCIONES.EJECUTAR_CORTE],
    [ESTADOS.CORTADO,              ACCIONES.EJECUTAR_RECONEXION],
    // Desde pendiente_reconexion solo EJECUTAR_RECONEXION
    [ESTADOS.PENDIENTE_RECONEXION, ACCIONES.MARCAR_MOROSO],
    [ESTADOS.PENDIENTE_RECONEXION, ACCIONES.PAGAR_PENDIENTE],
    [ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_CORTE],
    [ESTADOS.PENDIENTE_RECONEXION, ACCIONES.PAGAR_RECONEXION],
    [ESTADOS.PENDIENTE_RECONEXION, ACCIONES.RECONEXION_DIRECTA],
  ];

  it.each(CASOS_INVALIDOS)(
    'lanza al intentar "%s" + "%s"',
    (estado, accion) => {
      expect(() => aplicarTransicion(estado, accion, ctx)).toThrow();
    },
  );

  it('el mensaje de error menciona el estado actual', () => {
    expect(() =>
      aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.EJECUTAR_CORTE, ctx),
    ).toThrow(/activo/);
  });

  it('el mensaje de error menciona la acción inválida', () => {
    expect(() =>
      aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.EJECUTAR_CORTE, ctx),
    ).toThrow(/EJECUTAR_CORTE/);
  });

  it('el mensaje de error lista las acciones permitidas', () => {
    expect(() =>
      aplicarTransicion(ESTADOS.ACTIVO, ACCIONES.EJECUTAR_CORTE, ctx),
    ).toThrow(/MARCAR_MOROSO/);
  });
});

// ─── puedeTransicionar ────────────────────────────────────────────────────────

describe('puedeTransicionar', () => {
  it('devuelve true para transición válida', () => {
    expect(puedeTransicionar(ESTADOS.ACTIVO, ACCIONES.MARCAR_MOROSO)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_CORTE, ACCIONES.EJECUTAR_CORTE)).toBe(true);
    expect(puedeTransicionar(ESTADOS.CORTADO, ACCIONES.PAGAR_RECONEXION)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.EJECUTAR_RECONEXION)).toBe(true);
  });

  it('devuelve false para transición inválida', () => {
    expect(puedeTransicionar(ESTADOS.ACTIVO, ACCIONES.EJECUTAR_CORTE)).toBe(false);
    expect(puedeTransicionar(ESTADOS.CORTADO, ACCIONES.MARCAR_MOROSO)).toBe(false);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_RECONEXION, ACCIONES.PAGAR_RECONEXION)).toBe(false);
  });
});

// ─── transicionesDisponibles ──────────────────────────────────────────────────

describe('transicionesDisponibles', () => {
  it('devuelve [MARCAR_MOROSO → pendiente_corte] desde activo', () => {
    const ts = transicionesDisponibles(ESTADOS.ACTIVO);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toEqual({ accion: ACCIONES.MARCAR_MOROSO, destino: ESTADOS.PENDIENTE_CORTE });
  });

  it('devuelve 2 opciones desde pendiente_corte', () => {
    const ts = transicionesDisponibles(ESTADOS.PENDIENTE_CORTE);
    expect(ts).toHaveLength(2);
    const destinos = ts.map((t) => t.destino);
    expect(destinos).toContain(ESTADOS.ACTIVO);
    expect(destinos).toContain(ESTADOS.CORTADO);
  });

  it('devuelve 2 opciones desde cortado', () => {
    const ts = transicionesDisponibles(ESTADOS.CORTADO);
    expect(ts).toHaveLength(2);
    const destinos = ts.map((t) => t.destino);
    expect(destinos).toContain(ESTADOS.PENDIENTE_RECONEXION);
    expect(destinos).toContain(ESTADOS.ACTIVO);
  });

  it('devuelve [EJECUTAR_RECONEXION → activo] desde pendiente_reconexion', () => {
    const ts = transicionesDisponibles(ESTADOS.PENDIENTE_RECONEXION);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toEqual({ accion: ACCIONES.EJECUTAR_RECONEXION, destino: ESTADOS.ACTIVO });
  });
});
