import { describe, expect, it } from 'vitest';
import { buildEstadoServiciosFinanciero } from '@/src/application/reportes/estado-servicios-financiero';

describe('estado financiero de servicios', () => {
  it('separa cargos esperados, pagos confirmados y saldos pendientes sin duplicar agua', () => {
    const periodos = [{ mes: 4, anio: 2091 }];
    const perfiles = [
      { id: 'home-paid', edificio: '1', departamento: '1', usuario: { name: 'Residente pagado', responsableCargos: true } },
      { id: 'home-pending', edificio: '1', departamento: '2', usuario: { name: 'Residente pendiente', responsableCargos: true } },
      { id: 'home-no-charge', edificio: '2', departamento: '1', usuario: { name: 'Personal', responsableCargos: false } },
    ];
    const services = [
      { id: 'water', estado: 'activo', montoMensual: '100.00', servicio: { clave: 'agua', nombre: 'Agua', activo: true } },
      { id: 'chapeo', estado: 'activo', montoMensual: '20.00', servicio: { clave: 'chapeo', nombre: 'Chapeo', activo: true } },
      { id: 'donativo', estado: 'inactivo', montoMensual: '0.00', servicio: { clave: 'donativo', nombre: 'Donativo', activo: true } },
    ];
    const payments = [
      { perfilId: 'home-paid', mes: 4, anio: 2091, monto: '100.00', estado: 'pagado', metodo: 'transferencia' },
      { perfilId: 'home-pending', mes: 4, anio: 2091, monto: '100.00', estado: 'pendiente', metodo: 'transferencia' },
      // Pending retries share a home/period, but only one expected water fee is counted.
      { perfilId: 'home-pending', mes: 4, anio: 2091, monto: '100.00', estado: 'pendiente', metodo: 'transferencia' },
    ];
    const charges = [
      { id: 'paid-chapeo', perfilId: 'home-paid', fraccionamientoServicioId: 'chapeo', mes: 4, anio: 2091, monto: '20.00', estado: 'pagado', metodo: 'transferencia' },
      { id: 'pending-chapeo', perfilId: 'home-pending', fraccionamientoServicioId: 'chapeo', mes: 4, anio: 2091, monto: '20.00', estado: 'pendiente', metodo: null },
      // Donativo activation is inactive by design, but existing ledger rows remain reportable.
      { id: 'pending-donation', perfilId: 'home-paid', fraccionamientoServicioId: 'donativo', mes: 4, anio: 2091, monto: '40.00', estado: 'pendiente', metodo: null },
      { id: 'paid-donation', perfilId: 'home-pending', fraccionamientoServicioId: 'donativo', mes: 4, anio: 2091, monto: '40.00', estado: 'pagado', metodo: 'transferencia' },
      // Migration-era water cargo duplicates the water payment and is intentionally not counted twice.
      { id: 'legacy-water', perfilId: 'home-paid', fraccionamientoServicioId: 'water', mes: 4, anio: 2091, monto: '100.00', estado: 'pagado', metodo: 'transferencia' },
    ];

    const rows = buildEstadoServiciosFinanciero('Circuito A', periodos, perfiles, services, payments, charges);
    const expected = rows.reduce((sum, row) => sum + row.monto, 0);
    const confirmed = rows.filter(row => row.estado === 'pagado').reduce((sum, row) => sum + row.monto, 0);
    const pending = rows.filter(row => row.estado === 'pendiente').reduce((sum, row) => sum + row.monto, 0);

    expect(rows).toHaveLength(6);
    expect(expected).toBe(320);
    expect(confirmed).toBe(160);
    expect(pending).toBe(160);
    expect(rows.filter(row => row.servicio === 'Agua')).toHaveLength(2);
    expect(rows.every(row => row.fraccionamiento === 'Circuito A')).toBe(true);
  });

  it('no agrega pagos rechazados si no acreditaron pagos o cargos del ledger', () => {
    const rows = buildEstadoServiciosFinanciero(
      'Circuito B',
      [{ mes: 4, anio: 2091 }],
      [{ id: 'home', usuario: { responsableCargos: true } }],
      [{ id: 'agua', estado: 'activo', montoMensual: '75.00', servicio: { clave: 'agua', nombre: 'Agua', activo: true } }],
      [],
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ monto: 75, estado: 'pendiente' });
  });
});
