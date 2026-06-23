import ExcelJS from 'exceljs';

const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const COLOR_HEADER  = '1E4A6E';
const COLOR_PAGADO  = 'D1FAE5'; // verde claro
const COLOR_NO_PAGO = 'FEE2E2'; // rojo claro
const COLOR_ROW_ALT = 'F0F9FF'; // azul muy claro
const COLOR_WHITE   = 'FFFFFF';

function headerFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
}

function border(): Partial<ExcelJS.Borders> {
  const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

// ─────────────────────────────────────────────────────────────────
// REPORTE DE RESIDENTES
// ─────────────────────────────────────────────────────────────────
export interface ResidenteReporte {
  nombre: string;
  telefono: string;
  edificio: string;
  departamento: string;
  estadoAgua: string;
  pagosAnio: { mes: number; anio: number; monto: number | null; estado: 'pagado' | 'pendiente' }[];
  totalPagado: number;
  mesesSinPagar: number;
  ultimoPago: Date | null;
}

export async function generarReporteResidentesExcel(params: {
  circuito: string;
  generadoEn: Date;
  residentes: ResidenteReporte[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIS4S';
  wb.created = params.generadoEn;

  const ws = wb.addWorksheet('Residentes', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });

  const periodos = params.residentes[0]?.pagosAnio ?? [];

  // ── Título ────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, 8 + periodos.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = `Reporte de Residentes — ${params.circuito}`;
  titleCell.font  = { bold: true, size: 16, color: { argb: 'FF' + COLOR_HEADER } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, 8 + periodos.length);
  const subCell = ws.getCell('A2');
  subCell.value = `Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  subCell.font  = { size: 10, color: { argb: 'FF6B7280' } };
  subCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 18;

  // ── Encabezados ───────────────────────────────────────────────
  const headerRow = ws.addRow([
    'Nombre', 'Teléfono', 'Edificio', 'Depto.', 'Estado',
    ...periodos.map(p => `${MESES_ES[p.mes - 1]} ${String(p.anio).slice(2)}`),
    'Total 12m', 'Sin pagar', 'Último pago',
  ]);
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = border();
  });

  // ── Datos ─────────────────────────────────────────────────────
  const estadoLabel: Record<string, string> = {
    activo:                'Activo',
    pendiente_corte:       'Pte. Corte',
    cortado:               'Cortado',
    pendiente_reconexion:  'Pte. Reconex.',
  };

  params.residentes.forEach((r, i) => {
    const rowData: (string | number | null)[] = [
      r.nombre,
      r.telefono,
      r.edificio,
      r.departamento,
      estadoLabel[r.estadoAgua] ?? r.estadoAgua,
      ...r.pagosAnio.map(p => p.estado === 'pagado' ? 'SI' : 'NO'),
      r.totalPagado,
      r.mesesSinPagar,
      r.ultimoPago ? new Date(r.ultimoPago).toLocaleDateString('es-MX') : '—',
    ];
    const row = ws.addRow(rowData);
    row.height = 18;
    const isAlt = i % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      // columnas de mes (6 a 5+periodos.length)
      const mesCols = periodos.length;
      if (colNum >= 6 && colNum <= 5 + mesCols) {
        const pagado = cell.value === 'SI';
        cell.fill = headerFill(pagado ? COLOR_PAGADO.replace('#','') : COLOR_NO_PAGO.replace('#',''));
        cell.font = { bold: true, color: { argb: pagado ? 'FF065F46' : 'FF991B1B' }, size: 9 };
      } else {
        cell.fill = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.font = { size: 9 };
        if (colNum === 1) { cell.alignment.horizontal = 'left'; }
      }
    });

    // Total pagado en verde
    const totalCol = 6 + periodos.length;
    const totalCell = row.getCell(totalCol);
    totalCell.numFmt = '"$"#,##0.00';
    totalCell.font   = { bold: true, color: { argb: 'FF065F46' }, size: 9 };

    // Sin pagar en rojo si > 0
    const sinPagarCell = row.getCell(totalCol + 1);
    if (r.mesesSinPagar > 0) {
      sinPagarCell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 9 };
    }
  });

  // ── Resumen al final ──────────────────────────────────────────
  ws.addRow([]);
  const totalCols = 8 + periodos.length;
  const sumRow = ws.addRow([
    `Total residentes: ${params.residentes.length}`,
    '', '', '', '',
    ...periodos.map((_,idx) => {
      const count = params.residentes.filter(r => r.pagosAnio[idx]?.estado === 'pagado').length;
      return count;
    }),
    params.residentes.reduce((s, r) => s + r.totalPagado, 0),
    params.residentes.reduce((s, r) => s + r.mesesSinPagar, 0),
    '',
  ]);
  sumRow.height = 20;
  sumRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum === 1 || colNum >= 6) {
      cell.fill   = headerFill('EFF6FF');
      cell.font   = { bold: true, size: 9, color: { argb: 'FF1E40AF' } };
      cell.border = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (colNum === 6 + periodos.length) {
      cell.numFmt = '"$"#,##0.00';
    }
  });
  ws.getCell(sumRow.number, 1).alignment = { horizontal: 'left' };

  // ── Anchos de columna ─────────────────────────────────────────
  ws.getColumn(1).width  = 22; // nombre
  ws.getColumn(2).width  = 14; // teléfono
  ws.getColumn(3).width  = 9;  // edificio
  ws.getColumn(4).width  = 9;  // depto
  ws.getColumn(5).width  = 14; // estado
  for (let c = 6; c <= 5 + periodos.length; c++) ws.getColumn(c).width = 8;
  ws.getColumn(6 + periodos.length).width     = 11; // total
  ws.getColumn(6 + periodos.length + 1).width = 10; // sin pagar
  ws.getColumn(6 + periodos.length + 2).width = 13; // último pago

  // Congelar filas de título + encabezado
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// ─────────────────────────────────────────────────────────────────
// REPORTE FINANCIERO
// ─────────────────────────────────────────────────────────────────
export interface GastoReporte {
  concepto: string;
  monto: string | number;
  categoria: string;
  fecha: Date;
}

export interface EdificioFinanciero {
  edificio: string;
  totalPagado: number;
  cantidadPagos: number;
  residentesActivos: number;
  residentesMorosos: number;
}

export async function generarReporteFinancieroExcel(params: {
  circuito: string;
  mes: number;
  anio: number;
  generadoEn: Date;
  totalRecaudado: number;
  totalResidentes: number;
  totalPagaron: number;
  totalMorosos: number;
  porcentajeCobranza: number;
  saldo: number;
  totalGastos: number;
  porEdificio: EdificioFinanciero[];
  gastos: GastoReporte[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIS4S';
  wb.created = params.generadoEn;

  const mesNombre = MESES_ES[params.mes - 1];

  // ════════════════════════════════════════════
  // Hoja 1: Resumen
  // ════════════════════════════════════════════
  const wsR = wb.addWorksheet('Resumen');

  // Título
  wsR.mergeCells('A1:D1');
  const t = wsR.getCell('A1');
  t.value = `Reporte Financiero — ${params.circuito}`;
  t.font  = { bold: true, size: 16, color: { argb: 'FF' + COLOR_HEADER } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  wsR.getRow(1).height = 30;

  wsR.mergeCells('A2:D2');
  const sub = wsR.getCell('A2');
  sub.value = `Período: ${mesNombre} ${params.anio}   |   Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sub.font  = { size: 10, color: { argb: 'FF6B7280' } };
  sub.alignment = { horizontal: 'center' };
  wsR.getRow(2).height = 18;

  wsR.addRow([]);

  // KPIs
  const kpis: [string, string | number, string][] = [
    ['Total Recaudado',    params.totalRecaudado,    '"$"#,##0.00'],
    ['Total Gastos',       params.totalGastos,       '"$"#,##0.00'],
    ['Saldo',             params.saldo,              '"$"#,##0.00'],
    ['% Cobranza',        params.porcentajeCobranza, '0.0"%"'],
    ['Total Residentes',  params.totalResidentes,    '0'],
    ['Pagaron',           params.totalPagaron,       '0'],
    ['Morosos',           params.totalMorosos,       '0'],
  ];

  const kpiHeader = wsR.addRow(['Indicador', 'Valor']);
  kpiHeader.height = 20;
  kpiHeader.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  kpis.forEach(([label, value, fmt], i) => {
    const row = wsR.addRow([label, value]);
    row.height = 20;
    const isAlt = i % 2 === 1;
    row.getCell(1).fill   = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(1).font   = { bold: true, size: 10 };
    row.getCell(1).border = border();
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).fill    = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(2).numFmt  = fmt;
    row.getCell(2).border  = border();
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

    if (label === 'Saldo') {
      row.getCell(2).font = { bold: true, color: { argb: params.saldo >= 0 ? 'FF065F46' : 'FF991B1B' }, size: 10 };
    } else if (label === 'Total Recaudado') {
      row.getCell(2).font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
    } else if (label === 'Total Gastos') {
      row.getCell(2).font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 };
    } else if (label === 'Morosos') {
      row.getCell(2).font = { bold: true, color: { argb: params.totalMorosos > 0 ? 'FF991B1B' : 'FF374151' }, size: 10 };
    }
  });

  wsR.getColumn(1).width = 22;
  wsR.getColumn(2).width = 18;

  // ════════════════════════════════════════════
  // Hoja 2: Por Edificio
  // ════════════════════════════════════════════
  const wsE = wb.addWorksheet('Por Edificio');

  wsE.mergeCells('A1:E1');
  const te = wsE.getCell('A1');
  te.value = `Cobranza por Edificio — ${mesNombre} ${params.anio}`;
  te.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  te.alignment = { horizontal: 'center', vertical: 'middle' };
  wsE.getRow(1).height = 26;
  wsE.addRow([]);

  const ehRow = wsE.addRow(['Edificio', 'Recaudado', 'Pagos', 'Al corriente', 'Morosos']);
  ehRow.height = 20;
  ehRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  params.porEdificio.forEach((ed, i) => {
    const row = wsE.addRow([
      `Edif. ${ed.edificio}`,
      ed.totalPagado,
      ed.cantidadPagos,
      ed.residentesActivos,
      ed.residentesMorosos,
    ]);
    row.height = 18;
    const isAlt = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font      = { size: 10 };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 2) { cell.numFmt = '"$"#,##0.00'; cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 }; }
      if (colNum === 5 && ed.residentesMorosos > 0) cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 };
    });
  });

  // Totales
  const eTotalRow = wsE.addRow([
    'TOTAL',
    params.totalRecaudado,
    params.totalPagaron,
    params.totalPagaron,
    params.totalMorosos,
  ]);
  eTotalRow.height = 20;
  eTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill   = headerFill('DBEAFE');
    cell.font   = { bold: true, size: 10, color: { argb: 'FF1E40AF' } };
    cell.border = border();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (colNum === 1) cell.alignment.horizontal = 'left';
    if (colNum === 2) cell.numFmt = '"$"#,##0.00';
  });

  wsE.getColumn(1).width = 14;
  wsE.getColumn(2).width = 16;
  wsE.getColumn(3).width = 10;
  wsE.getColumn(4).width = 14;
  wsE.getColumn(5).width = 12;

  // ════════════════════════════════════════════
  // Hoja 3: Gastos
  // ════════════════════════════════════════════
  const wsG = wb.addWorksheet('Gastos');

  wsG.mergeCells('A1:D1');
  const tg = wsG.getCell('A1');
  tg.value = `Gastos — ${mesNombre} ${params.anio}`;
  tg.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  tg.alignment = { horizontal: 'center', vertical: 'middle' };
  wsG.getRow(1).height = 26;
  wsG.addRow([]);

  const ghRow = wsG.addRow(['Concepto', 'Categoría', 'Fecha', 'Monto']);
  ghRow.height = 20;
  ghRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  if (params.gastos.length === 0) {
    const emptyRow = wsG.addRow(['Sin gastos registrados para este período', '', '', '']);
    wsG.mergeCells(emptyRow.number, 1, emptyRow.number, 4);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    params.gastos.forEach((g, i) => {
      const row = wsG.addRow([
        g.concepto,
        g.categoria,
        new Date(g.fecha).toLocaleDateString('es-MX'),
        Number(g.monto),
      ]);
      row.height = 18;
      const isAlt = i % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.border    = border();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font      = { size: 10 };
        if (colNum === 1) cell.alignment.horizontal = 'left';
        if (colNum === 4) { cell.numFmt = '"$"#,##0.00'; cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 }; }
      });
    });

    const gTotalRow = wsG.addRow(['TOTAL GASTOS', '', '', params.totalGastos]);
    gTotalRow.height = 20;
    gTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill   = headerFill('FEE2E2');
      cell.font   = { bold: true, size: 10, color: { argb: 'FF991B1B' } };
      cell.border = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 4) cell.numFmt = '"$"#,##0.00';
    });
  }

  wsG.getColumn(1).width = 30;
  wsG.getColumn(2).width = 16;
  wsG.getColumn(3).width = 14;
  wsG.getColumn(4).width = 14;

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
