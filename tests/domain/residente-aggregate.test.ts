import { describe, it, expect } from 'vitest';
import { ResidenteAggregate } from '@/src/domain/residente/residente.aggregate';
import { PagoRegistradoEvent } from '@/src/domain/residente/events/pago-registrado.event';
import { CorteEjecutadoEvent } from '@/src/domain/residente/events/corte-ejecutado.event';

const baseProps = {
  id:           'res-001',
  userId:       'user-001',
  circuitoId:   'circ-001',
  edificio:     'A',
  departamento: '101',
};

describe('ResidenteAggregate', () => {
  it('registrarPago desde activo emite PagoRegistradoEvent sin cambiar estado', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'activo' });
    r.registrarPago('AGU-0000000001');
    const events = r.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(PagoRegistradoEvent);
    expect(r.estadoAgua).toBe('activo');
  });

  it('registrarPago desde pendiente_corte transiciona a activo', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'pendiente_corte' });
    r.registrarPago('AGU-0000000002');
    expect(r.estadoAgua).toBe('activo');
    const events = r.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(PagoRegistradoEvent);
  });

  it('registrarPago desde cortado transiciona a pendiente_reconexion', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'cortado' });
    r.registrarPago('AGU-0000000003');
    expect(r.estadoAgua).toBe('pendiente_reconexion');
  });

  it('confirmarCorte desde pendiente_corte transiciona a cortado', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'pendiente_corte' });
    r.confirmarCorte({ fecha: new Date(), actorId: 'trabajador-001' });
    expect(r.estadoAgua).toBe('cortado');
    const events = r.pullEvents();
    expect(events[0]).toBeInstanceOf(CorteEjecutadoEvent);
  });

  it('confirmarCorte desde activo lanza error', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'activo' });
    expect(() => r.confirmarCorte({ fecha: new Date(), actorId: 'trab' })).toThrow();
  });

  it('confirmarReconexion desde pendiente_reconexion transiciona a activo', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'pendiente_reconexion' });
    r.confirmarReconexion({ fecha: new Date(), actorId: 'trab-001' });
    expect(r.estadoAgua).toBe('activo');
  });

  it('pullEvents limpia la lista de eventos', () => {
    const r = ResidenteAggregate.reconstitute({ ...baseProps, estadoAgua: 'activo' });
    r.registrarPago('AGU-0000000004');
    r.pullEvents();
    expect(r.pullEvents()).toHaveLength(0);
  });
});
