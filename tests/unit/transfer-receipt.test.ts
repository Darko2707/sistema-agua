import { describe, expect, it } from 'vitest';
import { buildTransferReceiptItems, sumTransferReceiptItems } from '@/lib/transfer-receipt';

describe('recibo de transferencia consolidado', () => {
  it('incluye solo conceptos seleccionados que estén pagados', () => {
    const items = buildTransferReceiptItems({
      mesesSeleccionados: [{ mes: 2, anio: 2027 }],
      pagos: [
        { mes: 2, anio: 2027, monto: '50.00', estado: 'pagado' },
        { mes: 3, anio: 2027, monto: '50.00', estado: 'pagado' },
      ],
      cargosSeleccionados: ['chapeo', 'basura'],
      cargos: [
        { id: 'chapeo', mes: 2, anio: 2027, monto: '20.00', estado: 'pagado', servicioNombre: 'Chapeo' },
        { id: 'basura', mes: 2, anio: 2027, monto: '20.00', estado: 'pendiente', servicioNombre: 'Basura' },
        { id: 'otro', mes: 2, anio: 2027, monto: '10.00', estado: 'pagado', servicioNombre: 'Otro' },
      ],
    });

    expect(items.map(({ descripcion }) => descripcion)).toEqual(['Agua', 'Chapeo']);
    expect(sumTransferReceiptItems(items)).toBe('70.00');
  });

  it('omite agua cuando no se seleccionaron periodos de agua', () => {
    const items = buildTransferReceiptItems({
      mesesSeleccionados: [],
      pagos: [{ mes: 2, anio: 2027, monto: '50.00', estado: 'pagado' }],
      cargosSeleccionados: ['chapeo'],
      cargos: [{ id: 'chapeo', mes: 2, anio: 2027, monto: '20.00', estado: 'pagado', servicioNombre: 'Chapeo' }],
    });

    expect(items).toEqual([{ descripcion: 'Chapeo', mes: 2, anio: 2027, monto: '20.00', tipo: 'servicio' }]);
  });

  it('omite agua cuando el periodo seleccionado no quedó pagado', () => {
    const items = buildTransferReceiptItems({
      mesesSeleccionados: [{ mes: 2, anio: 2027 }],
      pagos: [{ mes: 2, anio: 2027, monto: '50.00', estado: 'pendiente' }],
      cargosSeleccionados: ['basura'],
      cargos: [{ id: 'basura', mes: 2, anio: 2027, monto: '20.00', estado: 'pagado', servicioNombre: 'Basura' }],
    });

    expect(items.map(item => item.descripcion)).toEqual(['Basura']);
    expect(sumTransferReceiptItems(items)).toBe('20.00');
  });
});
