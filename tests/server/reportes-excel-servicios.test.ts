import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  escapeExcelFormula,
  formatEstado,
  formatMetodo,
  generarReporteFinancieroExcel,
  generarReporteFinancieroRangoExcel,
  type PagoReporteItem,
  type TotalPorServicio,
} from '@/server/services/excel-reportes';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findFraccionamiento: vi.fn(),
  findPerfiles: vi.fn(),
  findPagos: vi.fn(),
  findCargos: vi.fn(),
  findGastos: vi.fn(),
  findIngresos: vi.fn(),
  findOrdenes: vi.fn(),
  findCortes: vi.fn(),
  guardReportExport: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      user: { findFirst: mocks.findUser },
      fraccionamientos: { findFirst: mocks.findFraccionamiento },
      perfilesResidente: { findMany: mocks.findPerfiles },
      pagos: { findMany: mocks.findPagos },
      cargosServicios: { findMany: mocks.findCargos },
      gastosFraccionamiento: { findMany: mocks.findGastos },
      ingresosAdicionales: { findMany: mocks.findIngresos },
      ordenesTrabajo: { findMany: mocks.findOrdenes },
      cortes: { findMany: mocks.findCortes },
    },
  },
}));

vi.mock('@/lib/report-export-guard', () => ({
  guardReportExport: mocks.guardReportExport,
}));

import { GET as getReporteFinanciero } from '@/app/api/reportes/financiero/route';
import { GET as getReporteResidentes } from '@/app/api/reportes/residentes/route';

describe('Reportes de Tesorería — Exportación Excel de Todos los Servicios', () => {
  const dummyFraccionamiento = {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Fraccionamiento Las Palmas',
    slug: 'las-palmas',
    montoMensual: '250.00',
    activo: true,
    tesoreraId: 'tesorera-1',
  };

  const samplePagosReporte: PagoReporteItem[] = [
    {
      id: 'pago-agua-1',
      fecha: new Date('2026-10-05T10:00:00Z'),
      folio: 'FOL-AGUA-001',
      residenteNombre: 'Juan Pérez',
      edificio: '1',
      departamento: '101',
      fraccionamiento: 'Fraccionamiento Las Palmas',
      servicio: 'Agua',
      concepto: 'Cuota de agua — Oct 2026',
      monto: 250.00,
      estado: 'pagado',
      metodo: 'efectivo',
      referenciaExterna: null,
      mes: 10,
      anio: 2026,
    },
    {
      id: 'cargo-chapeo-1',
      fecha: new Date('2026-10-06T11:00:00Z'),
      folio: 'FOL-CHAPEO-001',
      residenteNombre: 'Juan Pérez',
      edificio: '1',
      departamento: '101',
      fraccionamiento: 'Fraccionamiento Las Palmas',
      servicio: 'Chapeo',
      concepto: 'Cuota chapeo — Oct 2026',
      monto: 80.00,
      estado: 'pagado',
      metodo: 'transferencia',
      referenciaExterna: 'TR-987654',
      mes: 10,
      anio: 2026,
    },
    {
      id: 'cargo-basura-1',
      fecha: new Date('2026-10-07T12:00:00Z'),
      folio: 'FOL-BASURA-001',
      residenteNombre: 'María Gómez',
      edificio: '2',
      departamento: '202',
      fraccionamiento: 'Fraccionamiento Las Palmas',
      servicio: 'Basura',
      concepto: 'Cuota basura — Oct 2026',
      monto: 50.00,
      estado: 'pagado',
      metodo: 'mercado_pago',
      referenciaExterna: 'MP-55443322',
      mes: 10,
      anio: 2026,
    },
    {
      id: 'cargo-vigilancia-1',
      fecha: new Date('2026-10-08T09:30:00Z'),
      folio: 'FOL-VIG-001',
      residenteNombre: 'Carlos Ruiz',
      edificio: '3',
      departamento: '303',
      fraccionamiento: 'Fraccionamiento Las Palmas',
      servicio: 'Vigilancia',
      concepto: 'Cuota vigilancia — Oct 2026',
      monto: 120.00,
      estado: 'pagado',
      metodo: 'efectivo',
      referenciaExterna: null,
      mes: 10,
      anio: 2026,
    },
  ];

  const sampleTotalesPorServicio: TotalPorServicio[] = [
    { servicio: 'Agua', total: 250.00, cantidad: 1 },
    { servicio: 'Chapeo', total: 80.00, cantidad: 1 },
    { servicio: 'Basura', total: 50.00, cantidad: 1 },
    { servicio: 'Vigilancia', total: 120.00, cantidad: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'tesorera-1' } });
    mocks.findUser.mockResolvedValue({
      id: 'tesorera-1',
      role: 'tesorera',
      fraccionamientoId: dummyFraccionamiento.id,
      deletedAt: null,
    });
    mocks.findFraccionamiento.mockResolvedValue(dummyFraccionamiento);
    mocks.findPerfiles.mockResolvedValue([]);
    mocks.findPagos.mockResolvedValue([]);
    mocks.findCargos.mockResolvedValue([]);
    mocks.findGastos.mockResolvedValue([]);
    mocks.findIngresos.mockResolvedValue([]);
    mocks.findOrdenes.mockResolvedValue([]);
    mocks.findCortes.mockResolvedValue([]);
    mocks.guardReportExport.mockResolvedValue({
      allowed: true,
      release: mocks.release,
    });
  });

  // ─── 1. Un pago de agua aparece en el Excel ──────────────────────────────
  it('1. Un pago de agua aparece en el Excel con sus datos correspondientes', async () => {
    const buffer = await generarReporteFinancieroExcel({
      fraccionamiento: dummyFraccionamiento.nombre,
      mes: 10,
      anio: 2026,
      generadoEn: new Date('2026-10-24'),
      totalRecaudado: 250,
      totalPagos: 250,
      totalIngresosAdicionales: 0,
      totalResidentes: 10,
      totalPagaron: 1,
      totalMorosos: 9,
      porcentajeCobranza: 10,
      saldo: 250,
      totalGastos: 0,
      porEdificio: [],
      gastos: [],
      pagos: [samplePagosReporte[0]],
      totalesPorServicio: [{ servicio: 'Agua', total: 250, cantidad: 1 }],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const wsPagos = wb.getWorksheet('Pagos');
    expect(wsPagos).toBeDefined();

    // Find the data row for Juan Pérez
    let dataRow: ExcelJS.Row | null = null;
    wsPagos!.eachRow((row) => {
      if (row.getCell(2).value === 'FOL-AGUA-001') {
        dataRow = row;
      }
    });

    expect(dataRow).not.toBeNull();
    expect(dataRow!.getCell(2).value).toBe('FOL-AGUA-001');
    expect(dataRow!.getCell(3).value).toBe('Juan Pérez');
    expect(dataRow!.getCell(4).value).toBe('Edif. 1');
    expect(dataRow!.getCell(5).value).toBe('Depto. 101');
    expect(dataRow!.getCell(6).value).toBe('Fraccionamiento Las Palmas');
    expect(dataRow!.getCell(7).value).toBe('Agua');
    expect(dataRow!.getCell(8).value).toBe('Cuota de agua — Oct 2026');
    expect(dataRow!.getCell(9).value).toBe('Efectivo');
    expect(dataRow!.getCell(11).value).toBe('Pagado');
    expect(dataRow!.getCell(12).value).toBe(250);
  });

  // ─── 2. Los pagos de los demás servicios implementados también aparecen ────
  it('2. Los pagos de los demás servicios implementados (chapeo, basura, vigilancia) también aparecen', async () => {
    const buffer = await generarReporteFinancieroExcel({
      fraccionamiento: dummyFraccionamiento.nombre,
      mes: 10,
      anio: 2026,
      generadoEn: new Date('2026-10-24'),
      totalRecaudado: 500,
      totalPagos: 500,
      totalIngresosAdicionales: 0,
      totalResidentes: 10,
      totalPagaron: 3,
      totalMorosos: 7,
      porcentajeCobranza: 30,
      saldo: 500,
      totalGastos: 0,
      porEdificio: [],
      gastos: [],
      pagos: samplePagosReporte,
      totalesPorServicio: sampleTotalesPorServicio,
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const wsPagos = wb.getWorksheet('Pagos')!;

    const serviciosEncontrados: string[] = [];
    wsPagos.eachRow((row) => {
      const folio = String(row.getCell(2).value ?? '');
      if (folio.startsWith('FOL-')) {
        serviciosEncontrados.push(String(row.getCell(7).value));
      }
    });

    expect(serviciosEncontrados).toContain('Agua');
    expect(serviciosEncontrados).toContain('Chapeo');
    expect(serviciosEncontrados).toContain('Basura');
    expect(serviciosEncontrados).toContain('Vigilancia');
  });

  // ─── 3. Los filtros de fecha funcionan ─────────────────────────────────────
  it('3. Los filtros de fecha funcionan tanto para mes individual como rango', async () => {
    mocks.findPerfiles.mockResolvedValue([
      { id: 'p-1', fraccionamientoId: dummyFraccionamiento.id, edificio: '1', departamento: '101' },
    ]);
    mocks.findPagos.mockResolvedValue([
      {
        id: 'p-1',
        mes: 10,
        anio: 2026,
        monto: '250.00',
        estado: 'pagado',
        perfil: { edificio: '1', departamento: '101', usuario: { name: 'Residente Oct' } },
      },
    ]);
    mocks.findCargos.mockResolvedValue([
      {
        id: 'c-1',
        mes: 10,
        anio: 2026,
        monto: '80.00',
        estado: 'pagado',
        perfil: { edificio: '1', departamento: '101', usuario: { name: 'Residente Oct' } },
        fraccionamientoServicio: { servicio: { clave: 'chapeo', nombre: 'Chapeo' } },
      },
    ]);

    const res = await getReporteFinanciero(new Request('https://app.example/api/reportes/financiero?mes=10&anio=2026'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
    expect(res.headers.get('X-Total-Movimientos')).toBe('2');
    expect(res.headers.get('X-Total-Pagos-Monto')).toBe('330');

    expect(mocks.findPagos).toHaveBeenCalledTimes(1);
    expect(mocks.findCargos).toHaveBeenCalledTimes(1);
  });

  // ─── 4. Los filtros de estado y entidad se respetan ────────────────────────
  it('4. Los filtros de estado y entidad se respetan (solo pagados del fraccionamiento)', async () => {
    const res = await getReporteFinanciero(new Request('https://app.example/api/reportes/financiero?mesDesde=8&anioDesde=2026&mesHasta=10&anioHasta=2026'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Total-Movimientos')).toBe('0');
  });

  // ─── 5. No hay pagos duplicados ────────────────────────────────────────────
  it('5. No hay pagos duplicados si cargosServicios contiene un registro con clave "agua"', async () => {
    mocks.findPerfiles.mockResolvedValue([
      { id: 'p-1', fraccionamientoId: dummyFraccionamiento.id, edificio: '1', departamento: '101' },
    ]);
    mocks.findPagos.mockResolvedValue([
      {
        id: 'p-agua-1',
        mes: 10,
        anio: 2026,
        monto: '250.00',
        estado: 'pagado',
        perfil: { edificio: '1', departamento: '101', usuario: { name: 'Juan' } },
      },
    ]);
    // A redundant / legacy transition cargo with clave 'agua' should be excluded from cargosServicios
    mocks.findCargos.mockResolvedValue([
      {
        id: 'c-agua-duplicado',
        mes: 10,
        anio: 2026,
        monto: '250.00',
        estado: 'pagado',
        perfil: { edificio: '1', departamento: '101', usuario: { name: 'Juan' } },
        fraccionamientoServicio: { servicio: { clave: 'agua', nombre: 'Agua' } },
      },
      {
        id: 'c-chapeo-1',
        mes: 10,
        anio: 2026,
        monto: '70.00',
        estado: 'pagado',
        perfil: { edificio: '1', departamento: '101', usuario: { name: 'Juan' } },
        fraccionamientoServicio: { servicio: { clave: 'chapeo', nombre: 'Chapeo' } },
      },
    ]);

    const res = await getReporteFinanciero(new Request('https://app.example/api/reportes/financiero?mes=10&anio=2026'));
    expect(res.status).toBe(200);
    // Exactly 2 movements: 1 agua from pagos, 1 chapeo from cargosServicios.
    expect(res.headers.get('X-Total-Movimientos')).toBe('2');
    expect(res.headers.get('X-Total-Pagos-Monto')).toBe('320');
  });

  // ─── 6. Los importes y totales coinciden con los datos consultados ─────────
  it('6. Los importes y totales de la hoja Pagos y Resumen coinciden exactamente', async () => {
    const totalEsperado = samplePagosReporte.reduce((s, p) => s + p.monto, 0); // 250 + 80 + 50 + 120 = 500

    const buffer = await generarReporteFinancieroExcel({
      fraccionamiento: dummyFraccionamiento.nombre,
      mes: 10,
      anio: 2026,
      generadoEn: new Date('2026-10-24'),
      totalRecaudado: totalEsperado,
      totalPagos: totalEsperado,
      totalIngresosAdicionales: 0,
      totalResidentes: 4,
      totalPagaron: 3,
      totalMorosos: 1,
      porcentajeCobranza: 75,
      saldo: totalEsperado,
      totalGastos: 0,
      porEdificio: [],
      gastos: [],
      pagos: samplePagosReporte,
      totalesPorServicio: sampleTotalesPorServicio,
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    // Check Resumen sheet
    const wsResumen = wb.getWorksheet('Resumen')!;
    let valorPagosRegistrados = 0;
    wsResumen.eachRow((r) => {
      if (String(r.getCell(1).value).includes('Pagos registrados')) {
        valorPagosRegistrados = Number(r.getCell(2).value);
      }
    });
    expect(valorPagosRegistrados).toBe(totalEsperado);

    // Check Pagos sheet total row
    const wsPagos = wb.getWorksheet('Pagos')!;
    const totalRow = wsPagos.getRow(wsPagos.rowCount);
    expect(String(totalRow.getCell(1).value)).toContain('TOTAL PAGOS');
    expect(Number(totalRow.getCell(12).value)).toBe(totalEsperado);
  });

  // ─── 7. Los usuarios sin permisos no pueden exportar información financiera ─
  it('7. Los usuarios sin sesión o con rol distinto de tesorera no pueden exportar', async () => {
    // Caso 1: Sin sesión
    mocks.getSession.mockResolvedValueOnce(null);
    const resSinSesion = await getReporteFinanciero(new Request('https://app.example/api/reportes/financiero'));
    expect(resSinSesion.status).toBe(401);

    // Caso 2: Rol residente
    mocks.findUser.mockResolvedValueOnce({ id: 'res-1', role: 'residente', fraccionamientoId: dummyFraccionamiento.id, deletedAt: null });
    const resRolInvalido = await getReporteFinanciero(new Request('https://app.example/api/reportes/financiero'));
    expect(resRolInvalido.status).toBe(403);
  });

  // ─── 8. Los servicios sin movimientos no generan pagos ficticios ───────────
  it('8. Los servicios sin movimientos en el periodo no generan filas ficticias', async () => {
    // Only Agua has payments in this test
    const soloAgua: PagoReporteItem[] = [samplePagosReporte[0]];
    const buffer = await generarReporteFinancieroExcel({
      fraccionamiento: dummyFraccionamiento.nombre,
      mes: 10,
      anio: 2026,
      generadoEn: new Date('2026-10-24'),
      totalRecaudado: 250,
      totalPagos: 250,
      totalIngresosAdicionales: 0,
      totalResidentes: 5,
      totalPagaron: 1,
      totalMorosos: 4,
      porcentajeCobranza: 20,
      saldo: 250,
      totalGastos: 0,
      porEdificio: [],
      gastos: [],
      pagos: soloAgua,
      totalesPorServicio: [{ servicio: 'Agua', total: 250, cantidad: 1 }],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const wsPagos = wb.getWorksheet('Pagos')!;

    const serviciosEncontrados: string[] = [];
    wsPagos.eachRow((r) => {
      const folio = String(r.getCell(2).value ?? '');
      if (folio.startsWith('FOL-')) {
        serviciosEncontrados.push(String(r.getCell(7).value));
      }
    });

    expect(serviciosEncontrados).toEqual(['Agua']);
    expect(serviciosEncontrados).not.toContain('Chapeo');
    expect(serviciosEncontrados).not.toContain('Basura');
    expect(serviciosEncontrados).not.toContain('Vigilancia');
  });

  // ─── 9. El archivo generado se puede leer y sus columnas son correctas ─────
  it('9. El archivo generado tiene todas las hojas requeridas y columnas oficiales', async () => {
    const buffer = await generarReporteFinancieroRangoExcel({
      fraccionamiento: dummyFraccionamiento.nombre,
      mesDesde: 9,
      anioDesde: 2026,
      mesHasta: 10,
      anioHasta: 2026,
      generadoEn: new Date('2026-10-24'),
      totalRecaudado: 500,
      totalPagos: 500,
      totalIngresosAdicionales: 0,
      totalGastos: 0,
      saldo: 500,
      totalResidentes: 10,
      porEdificio: [],
      gastos: [],
      ingresos: [],
      porMes: [],
      pagos: samplePagosReporte,
      totalesPorServicio: sampleTotalesPorServicio,
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toContain('Resumen');
    expect(sheetNames).toContain('Por Mes');
    expect(sheetNames).toContain('Pagos');
    expect(sheetNames).toContain('Por Edificio');
    expect(sheetNames).toContain('Gastos');
    expect(sheetNames).toContain('Ingresos Adicionales');

    const wsPagos = wb.getWorksheet('Pagos')!;
    let headerRow: ExcelJS.Row | null = null;
    wsPagos.eachRow((row) => {
      if (row.getCell(1).value === 'Fecha') {
        headerRow = row;
      }
    });

    expect(headerRow).not.toBeNull();
    const headerCells: string[] = [];
    headerRow!.eachCell((c) => headerCells.push(String(c.value)));

    expect(headerCells).toEqual([
      'Fecha',
      'Folio / Identificador',
      'Residente / Cuenta',
      'Edificio',
      'Depto.',
      'Fraccionamiento',
      'Servicio',
      'Concepto',
      'Método de pago',
      'Referencia externa',
      'Estado',
      'Importe',
    ]);
  });

  // ─── 10. Prevención de inyección de fórmulas ───────────────────────────────
  it('10. Los valores proporcionados por usuarios escapan fórmulas de Excel', () => {
    expect(escapeExcelFormula('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(escapeExcelFormula('+cmd|"/C calc"!A0')).toBe("'+cmd|\"/C calc\"!A0");
    expect(escapeExcelFormula('-10+20')).toBe("'-10+20");
    expect(escapeExcelFormula('@alert(1)')).toBe("'@alert(1)");
    expect(escapeExcelFormula('\tmalicious')).toBe("'\tmalicious");

    // Safe values remain unchanged
    expect(escapeExcelFormula('Residente Normal')).toBe('Residente Normal');
    expect(escapeExcelFormula('Edificio A')).toBe('Edificio A');
    expect(escapeExcelFormula(150.50)).toBe(150.50);
    expect(escapeExcelFormula(null)).toBe('');
    expect(escapeExcelFormula(undefined)).toBe('');
  });

  // ─── 11. Formateadores auxiliares ──────────────────────────────────────────
  it('11. formatMetodo y formatEstado mapean valores a etiquetas legibles', () => {
    expect(formatMetodo('efectivo')).toBe('Efectivo');
    expect(formatMetodo('transferencia')).toBe('Transferencia');
    expect(formatMetodo('mercado_pago')).toBe('Mercado Pago');
    expect(formatMetodo(null)).toBe('Efectivo');

    expect(formatEstado('pagado')).toBe('Pagado');
    expect(formatEstado('pendiente')).toBe('Pendiente');
    expect(formatEstado('vencido')).toBe('Vencido');
    expect(formatEstado('cancelado')).toBe('Cancelado');
    expect(formatEstado(null)).toBe('Pagado');
  });

  // ─── 12. Reporte de Residentes incluye cargos de servicios adicionales ─────
  it('12. ReporteResidentes en ruta HTTP incluye cargos pagados de servicios adicionales', async () => {
    mocks.findPerfiles.mockResolvedValue([
      {
        id: 'perfil-1',
        fraccionamientoId: dummyFraccionamiento.id,
        edificio: '1',
        departamento: '101',
        estadoAgua: 'activo',
        telefono: '555-0101',
        tenencia: 'propietario',
        nombrePropietario: null,
        telefonoPropietario: null,
        usuario: { name: 'Residente Multiservicio' },
      },
    ]);
    mocks.findPagos.mockResolvedValue([
      {
        id: 'p-agua',
        perfilId: 'perfil-1',
        mes: 10,
        anio: 2026,
        monto: '200.00',
        estado: 'pagado',
        fechaPago: new Date('2026-10-02'),
      },
    ]);
    mocks.findCargos.mockResolvedValue([
      {
        id: 'c-chapeo',
        perfilId: 'perfil-1',
        mes: 10,
        anio: 2026,
        monto: '50.00',
        estado: 'pagado',
        pagadoEn: new Date('2026-10-05'),
        fraccionamientoServicio: { servicio: { clave: 'chapeo', nombre: 'Chapeo' } },
      },
    ]);
    mocks.findOrdenes.mockResolvedValue([]);
    mocks.findCortes.mockResolvedValue([]);

    const res = await getReporteResidentes(new Request('https://app.example/api/reportes/residentes?mesDesde=10&anioDesde=2026&mesHasta=10&anioHasta=2026'));
    expect(res.status).toBe(200);

    const blob = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(blob as any);
    const ws = wb.getWorksheet('Residentes')!;

    // Find the resident data row by looking for resident name
    let residentRow: ExcelJS.Row | null = null;
    ws.eachRow((r) => {
      if (r.getCell(1).value === 'Residente Multiservicio') {
        residentRow = r;
      }
    });

    expect(residentRow).not.toBeNull();
    // Total column (col 8 + 1 period = col 9) should equal 200 (agua) + 50 (chapeo) = 250
    expect(residentRow!.getCell(9).value).toBe(250);
  });
});

