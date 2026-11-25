import type ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { MESES_CORTO as MESES_ES, MESES_FULL } from '@/lib/meses';

const COLOR_HEADER  = '1E4A6E';
const COLOR_PAGADO  = 'D1FAE5';
const COLOR_NO_PAGO = 'FEE2E2';
const COLOR_ROW_ALT = 'F0F9FF';
const COLOR_WHITE   = 'FFFFFF';

function headerFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
}

function border(): Partial<ExcelJS.Borders> {
  const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

function getLogoBuffer(): Buffer | null {
  try {
    return Buffer.from(fs.readFileSync(path.join(process.cwd(), 'public', 'logo2SIS4S.png')));
  } catch {
    return null;
  }
}

// Agrega el logo en la esquina superior derecha de la hoja.
// totalDataCols: número de columnas de datos (para posicionar el logo a la derecha).
function agregarLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, totalDataCols: number) {
  const logoBuffer = getLogoBuffer();
  if (!logoBuffer) return;
  // Fondo blanco detrás del logo para mejorar visibilidad sobre fondos coloreados
  const whiteFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  for (let r = 1; r <= 4; r++) {
    const cell = ws.getCell(r, totalDataCols + 1);
    cell.fill = whiteFill;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageId = wb.addImage({ buffer: logoBuffer as any, extension: 'png' });
  ws.addImage(imageId, {
    tl: { col: totalDataCols, row: 0 },     // columna justo después de los datos
    ext: { width: 56, height: 56 },
    editAs: 'oneCell',
  } as ExcelJS.ImagePosition);
  // Dar ancho a la columna donde está el logo
  ws.getColumn(totalDataCols + 1).width = 9;
}

// ─────────────────────────────────────────────────────────────────
// SEGURIDAD Y FORMATEO DE CELDAS (PREVENCIÓN DE INYECCIÓN DE FÓRMULAS)
// ─────────────────────────────────────────────────────────────────

/**
 * Previene la inyección de fórmulas en Excel (CSV / Spreadsheet Formula Injection).
 * Si un valor textual comienza con =, +, -, @ o caracteres de control, antepone un apóstrofe (')
 * para forzar a Excel a tratarlo como texto literal y no como una fórmula ejecutable.
 */
export function escapeExcelFormula(val: unknown): unknown {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return val;
  if (/^[\t\r=+\-@]/.test(val) || /^[=+\-@]/.test(val.trim())) {
    return `'${val}`;
  }
  return val;
}

export function formatMetodo(metodo: string | null | undefined): string {
  if (!metodo) return 'Efectivo';
  const m = metodo.toLowerCase().trim();
  if (m === 'efectivo') return 'Efectivo';
  if (m === 'transferencia') return 'Transferencia';
  if (m === 'mercado_pago' || m === 'mercadopago') return 'Mercado Pago';
  return metodo;
}

export function formatEstado(estado: string | null | undefined): string {
  if (!estado) return 'Pagado';
  const e = estado.toLowerCase().trim();
  if (e === 'pagado') return 'Pagado';
  if (e === 'pendiente') return 'Pendiente';
  if (e === 'vencido') return 'Vencido';
  if (e === 'cancelado') return 'Cancelado';
  return estado;
}

export interface PagoReporteItem {
  id: string;
  fecha: Date;
  fechaTexto?: string;
  folio: string | null;
  residenteNombre: string;
  edificio: string;
  departamento: string;
  fraccionamiento: string;
  servicio: string;
  concepto: string;
  monto: number;
  estado: string;
  metodo: string | null;
  referenciaExterna: string | null;
  mes: number;
  anio: number;
}

export interface EstadoServicioReporteItem {
  residenteNombre: string;
  edificio: string;
  departamento: string;
  fraccionamiento: string;
  servicio: string;
  estado: string;
  metodo: string | null;
  monto: number;
  mes: number;
  anio: number;
}

export interface TotalPorServicio {
  servicio: string;
  total: number;
  cantidad: number;
}

interface GrupoPagoConsolidado {
  key: string;
  residenteNombre: string;
  edificio: string;
  departamento: string;
  fraccionamiento: string;
  mes: number;
  anio: number;
  fecha: Date;
  fechaTexto?: string;
  folios: string[];
  conceptos: string[];
  metodos: string[];
  montosPorServicio: Map<string, number>;
  totalImporte: number;
}

function resolverServiciosActivos(
  pagos: PagoReporteItem[],
  serviciosConfigurados?: string[],
  totalesPorServicio?: TotalPorServicio[],
): string[] {
  const servicios = new Set<string>();
  // 1. Siempre primero 'Mantenimiento de bomba'
  servicios.add('Mantenimiento de bomba');

  if (serviciosConfigurados && serviciosConfigurados.length > 0) {
    for (const s of serviciosConfigurados) {
      const nombre = (s === 'Agua' || s.toLowerCase().includes('bomba')) ? 'Mantenimiento de bomba' : s.trim();
      if (nombre) servicios.add(nombre);
    }
  }

  if (totalesPorServicio) {
    for (const t of totalesPorServicio) {
      const nombre = (t.servicio === 'Agua' || t.servicio.toLowerCase().includes('bomba')) ? 'Mantenimiento de bomba' : t.servicio.trim();
      if (nombre) servicios.add(nombre);
    }
  }

  for (const p of pagos) {
    const nombre = (p.servicio === 'Agua' || p.servicio.toLowerCase().includes('bomba')) ? 'Mantenimiento de bomba' : p.servicio.trim();
    if (nombre) servicios.add(nombre);
  }

  const lista = Array.from(servicios);
  lista.sort((a, b) => {
    if (a === 'Mantenimiento de bomba') return -1;
    if (b === 'Mantenimiento de bomba') return 1;
    return a.localeCompare(b, 'es');
  });
  return lista;
}

/**
 * Agrega la hoja consolidada de "Pagos" con una sola fila por residente y período,
 * mostrando columnas dinámicas por servicio activo y evaluación completa del estado.
 */
function agregarHojaPagos(
  wb: ExcelJS.Workbook,
  titulo: string,
  subtitulo: string,
  pagos: PagoReporteItem[] = [],
  serviciosConfigurados?: string[],
  totalesPorServicio?: TotalPorServicio[],
) {
  const wsP = wb.addWorksheet('Pagos');
  const serviciosActivos = resolverServiciosActivos(pagos, serviciosConfigurados, totalesPorServicio);
  const totalCols = 10 + serviciosActivos.length;
  agregarLogo(wb, wsP, totalCols);

  wsP.mergeCells(1, 1, 1, totalCols);
  const t = wsP.getCell('A1');
  t.value = titulo;
  t.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  wsP.getRow(1).height = 36;

  wsP.mergeCells(2, 1, 2, totalCols);
  const sub = wsP.getCell('A2');
  sub.value = subtitulo;
  sub.font  = { size: 10, color: { argb: 'FF6B7280' } };
  sub.alignment = { horizontal: 'center' };
  wsP.getRow(2).height = 20;

  wsP.addRow([]);

  // Encabezados en orden estricto (HU-S4-12):
  // 1. Fecha, 2. Folio / Identificador, 3. Residente / Cuenta, 4. Edificio, 5. Depto., 6. Fraccionamiento,
  // 7..6+K. Columnas dinámicas de los servicios activos,
  // 7+K. Concepto, 8+K. Método de pago, 9+K. Estado, 10+K. Importe
  const headers = [
    'Fecha',
    'Folio / Identificador',
    'Residente / Cuenta',
    'Edificio',
    'Depto.',
    'Fraccionamiento',
    ...serviciosActivos,
    'Concepto',
    'Método de pago',
    'Estado',
    'Importe',
  ];

  const phRow = wsP.addRow(headers);
  phRow.height = 22;
  phRow.eachCell((cell) => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = border();
  });

  if (pagos.length === 0) {
    const emptyRow = wsP.addRow(['Sin pagos registrados para este período', ...Array(totalCols - 1).fill('')]);
    wsP.mergeCells(emptyRow.number, 1, emptyRow.number, totalCols);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    // Agrupar en una sola fila por cuenta (residente/edificio/depto) y periodo (mes/año)
    const gruposMap = new Map<string, GrupoPagoConsolidado>();

    for (const p of pagos) {
      const servNombre = (p.servicio === 'Agua' || p.servicio.toLowerCase().includes('bomba'))
        ? 'Mantenimiento de bomba'
        : p.servicio.trim();
      const key = `${p.residenteNombre.trim()}|${(p.edificio ?? '').trim()}|${(p.departamento ?? '').trim()}|${p.mes}|${p.anio}`;

      let grupo = gruposMap.get(key);
      if (!grupo) {
        grupo = {
          key,
          residenteNombre: p.residenteNombre,
          edificio: p.edificio,
          departamento: p.departamento,
          fraccionamiento: p.fraccionamiento,
          mes: p.mes,
          anio: p.anio,
          fecha: p.fecha ?? new Date(),
          fechaTexto: p.fechaTexto,
          folios: [],
          conceptos: [],
          metodos: [],
          montosPorServicio: new Map<string, number>(),
          totalImporte: 0,
        };
        gruposMap.set(key, grupo);
      }

      const folioVal = p.folio ?? p.id;
      if (folioVal && !grupo.folios.includes(folioVal)) {
        grupo.folios.push(folioVal);
      }
      if (p.concepto && !grupo.conceptos.includes(p.concepto)) {
        grupo.conceptos.push(p.concepto);
      }
      const metodoFormateado = formatMetodo(p.metodo);
      if (metodoFormateado && !grupo.metodos.includes(metodoFormateado)) {
        grupo.metodos.push(metodoFormateado);
      }
      if (p.fecha && (!grupo.fecha || new Date(p.fecha).getTime() > new Date(grupo.fecha).getTime())) {
        grupo.fecha = p.fecha;
        grupo.fechaTexto = p.fechaTexto;
      }

      const montoActual = grupo.montosPorServicio.get(servNombre) ?? 0;
      grupo.montosPorServicio.set(servNombre, montoActual + Number(p.monto));
      grupo.totalImporte += Number(p.monto);
    }

    const grupos = Array.from(gruposMap.values()).sort((a, b) => {
      return a.anio - b.anio || a.mes - b.mes
        || a.edificio.localeCompare(b.edificio, 'es', { numeric: true })
        || a.departamento.localeCompare(b.departamento, 'es', { numeric: true })
        || a.residenteNombre.localeCompare(b.residenteNombre, 'es');
    });

    const k = serviciosActivos.length;
    const colConcepto = 7 + k;
    const colEstado = 9 + k;
    const colImporte = 10 + k;

    grupos.forEach((g, i) => {
      const fechaStr = g.fechaTexto ?? (g.fecha ? new Date(g.fecha).toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '');

      const serviciosCubiertos = serviciosActivos.filter(s => (g.montosPorServicio.get(s) ?? 0) > 0).length;
      const totalObligatorios = serviciosActivos.length;
      let estadoTexto: string;
      if (serviciosCubiertos >= totalObligatorios) {
        estadoTexto = 'Pagado completo';
      } else if (serviciosCubiertos > 0) {
        estadoTexto = `Pago parcial (${serviciosCubiertos}/${totalObligatorios} servicios)`;
      } else {
        estadoTexto = 'Pendiente';
      }

      const conceptoTexto = g.conceptos.length > 0
        ? g.conceptos.join('; ')
        : `${serviciosActivos.filter(s => (g.montosPorServicio.get(s) ?? 0) > 0).join(', ')} — ${MESES_FULL[g.mes - 1] ?? `Mes ${g.mes}`} ${g.anio}`;

      const rowValues = [
        fechaStr,
        escapeExcelFormula(g.folios.join(', ') || '-'),
        escapeExcelFormula(g.residenteNombre),
        escapeExcelFormula(g.edificio ? (g.edificio.toLowerCase().startsWith('edif') || g.edificio.toLowerCase().startsWith('casa') ? g.edificio : `Edif. ${g.edificio}`) : '-'),
        escapeExcelFormula(g.departamento ? (g.departamento.toLowerCase().startsWith('depto') || g.departamento.toLowerCase().startsWith('casa') ? g.departamento : `Depto. ${g.departamento}`) : '-'),
        escapeExcelFormula(g.fraccionamiento),
        ...serviciosActivos.map(s => {
          const val = g.montosPorServicio.get(s);
          return val !== undefined && val > 0 ? Number(val) : 0;
        }),
        escapeExcelFormula(conceptoTexto),
        escapeExcelFormula(g.metodos.join(', ') || 'Efectivo'),
        escapeExcelFormula(estadoTexto),
        Number(g.totalImporte),
      ];

      const row = wsP.addRow(rowValues);
      row.height = 18;
      const isAlt = i % 2 === 1;

      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.border    = border();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font      = { size: 10 };

        if ([2, 3, 6, colConcepto].includes(colNum)) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Columnas de servicios dinámicos
        if (colNum >= 7 && colNum <= 6 + k) {
          cell.numFmt = '"$"#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          const numVal = Number(cell.value);
          if (numVal > 0) {
            cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
          } else {
            cell.font = { color: { argb: 'FF9CA3AF' }, size: 9 };
          }
        }

        // Columna de Estado
        if (colNum === colEstado) {
          if (estadoTexto === 'Pagado completo') {
            cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 9 };
            cell.fill = headerFill('D1FAE5');
          } else if (estadoTexto.startsWith('Pago parcial')) {
            cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
            cell.fill = headerFill('FEF3C7');
          } else {
            cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 9 };
            cell.fill = headerFill('FEE2E2');
          }
        }

        // Columna de Importe total
        if (colNum === colImporte) {
          cell.numFmt    = '"$"#,##0.00';
          cell.font      = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    });

    const totalImporteGeneral = grupos.reduce((s, g) => s + g.totalImporte, 0);
    const totalRowValues = [
      `TOTAL PAGOS (${grupos.length} ${grupos.length === 1 ? 'cuenta' : 'cuentas'})`,
      '', '', '', '', '',
      ...serviciosActivos.map(s => {
        return grupos.reduce((sum, g) => sum + (g.montosPorServicio.get(s) ?? 0), 0);
      }),
      '', '', '',
      totalImporteGeneral,
    ];

    const pTotalRow = wsP.addRow(totalRowValues);
    pTotalRow.height = 20;
    pTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill('D1FAE5');
      cell.font      = { bold: true, size: 10, color: { argb: 'FF065F46' } };
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
      if ((colNum >= 7 && colNum <= 6 + k) || colNum === colImporte) {
        cell.numFmt = '"$"#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });
  }

  wsP.getColumn(1).width = 14; // Fecha
  wsP.getColumn(2).width = 22; // Folio
  wsP.getColumn(3).width = 26; // Residente
  wsP.getColumn(4).width = 12; // Edificio
  wsP.getColumn(5).width = 12; // Depto
  wsP.getColumn(6).width = 22; // Fraccionamiento
  serviciosActivos.forEach((_, idx) => {
    wsP.getColumn(7 + idx).width = 20; // Servicios dinámicos
  });
  wsP.getColumn(7 + serviciosActivos.length).width = 30; // Concepto
  wsP.getColumn(8 + serviciosActivos.length).width = 18; // Método
  wsP.getColumn(9 + serviciosActivos.length).width = 24; // Estado
  wsP.getColumn(10 + serviciosActivos.length).width = 16; // Importe

  wsP.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
}

function agregarHojaEstadoServicios(wb: ExcelJS.Workbook, items: EstadoServicioReporteItem[] = []) {
  const ws = wb.addWorksheet('Estado servicios');
  const totalCols = 8;
  agregarLogo(wb, ws, totalCols);
  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell('A1').value = 'Estado de cargos por servicio';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: `FF${COLOR_HEADER}` } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;
  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell('A2').value = 'Detalle por residente, periodo y servicio';
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF6B7280' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.addRow([]);

  const header = ws.addRow(['Periodo', 'Residente', 'Edificio', 'Depto.', 'Fraccionamiento', 'Servicio', 'Estado', 'Importe']);
  header.eachCell(cell => {
    cell.fill = headerFill(COLOR_HEADER);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border();
  });

  const ordenados = [...items].sort((a, b) => a.anio - b.anio || a.mes - b.mes
    || a.servicio.localeCompare(b.servicio, 'es')
    || a.residenteNombre.localeCompare(b.residenteNombre, 'es'));
  if (ordenados.length === 0) {
    const row = ws.addRow(['Sin cargos de servicios en el periodo', '', '', '', '', '', '', '']);
    ws.mergeCells(row.number, 1, row.number, totalCols);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    ordenados.forEach((item, index) => {
      const row = ws.addRow([
        `${MESES_FULL[item.mes - 1] ?? `Mes ${item.mes}`} ${item.anio}`,
        escapeExcelFormula(item.residenteNombre),
        escapeExcelFormula(item.edificio || '-'),
        escapeExcelFormula(item.departamento || '-'),
        escapeExcelFormula(item.fraccionamiento),
        escapeExcelFormula(item.servicio),
        escapeExcelFormula(formatEstado(item.estado)),
        Number(item.monto),
      ]);
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.fill = headerFill(index % 2 ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.border = border();
        cell.alignment = { horizontal: [2, 5, 6].includes(column) ? 'left' : 'center', vertical: 'middle' };
        cell.font = { size: 10 };
        if (column === 8) {
          cell.numFmt = '"$"#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    });
    ws.autoFilter = { from: 'A4', to: `H${3 + ordenados.length}` };
  }
  [18, 28, 12, 12, 24, 20, 16, 16].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];
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
  tenencia: string | null;
  nombrePropietario: string | null;
  telefonoPropietario: string | null;
  pagosAnio: { mes: number; anio: number; monto: number | null; estado: 'pagado' | 'pendiente' }[];
  totalPagado: number;
  mesesSinPagar: number;
  ultimoPago: Date | null;
  corteFisicoActivo?: boolean;
  ordenCorteEstado?: string | null;
  ordenReconexionEstado?: string | null;
}

export async function generarReporteResidentesExcel(params: {
  fraccionamiento: string;
  generadoEn: Date;
  residentes: ResidenteReporte[];
}): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SISCO';
  wb.created = params.generadoEn;

  const ws = wb.addWorksheet('Residentes', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });

  const periodos = params.residentes[0]?.pagosAnio ?? [];
  const totalCols = 13 + periodos.length; // columnas financieras y operativas

  // ── Logo (esquina superior derecha) ──────────────────────────
  agregarLogo(wb, ws, totalCols);

  // ── Título ────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell('A1');
  titleCell.value = `Reporte de Residentes — ${params.fraccionamiento}`;
  titleCell.font  = { bold: true, size: 16, color: { argb: 'FF' + COLOR_HEADER } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  ws.mergeCells(2, 1, 2, totalCols);
  const subCell = ws.getCell('A2');
  subCell.value = `Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  subCell.font  = { size: 10, color: { argb: 'FF6B7280' } };
  subCell.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 20;

  // ── Encabezados ───────────────────────────────────────────────
  const headerRow = ws.addRow([
    'Nombre', 'Teléfono', 'Edificio', 'Depto.', 'Estado', 'Tenencia', 'Propietario / Tel.',
    ...periodos.map(p => `${MESES_ES[p.mes - 1]} ${String(p.anio).slice(2)}`),
    'Total 12m', 'Sin pagar', 'Último pago',
  ]);
  const operacionHeaderCol = 11 + periodos.length;
  headerRow.getCell(operacionHeaderCol).value = 'Corte fisico';
  headerRow.getCell(operacionHeaderCol + 1).value = 'Orden corte';
  headerRow.getCell(operacionHeaderCol + 2).value = 'Orden reconex.';
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
    const propietarioInfo = r.tenencia === 'inquilino' && r.nombrePropietario
      ? `${r.nombrePropietario}${r.telefonoPropietario ? ' · ' + r.telefonoPropietario : ''}`
      : '';

    const rowData: (string | number | null)[] = [
      r.nombre,
      r.telefono,
      r.edificio,
      r.departamento,
      estadoLabel[r.estadoAgua] ?? r.estadoAgua,
      r.tenencia === 'inquilino' ? 'Inquilino' : 'Propietario',
      propietarioInfo || '—',
      ...r.pagosAnio.map(p => p.estado === 'pagado' ? 'SI' : 'NO'),
      r.totalPagado,
      r.mesesSinPagar,
      r.ultimoPago ? new Date(r.ultimoPago).toLocaleDateString('es-MX') : '—',
    ];
    rowData.push(
      r.corteFisicoActivo ? 'Activo' : 'No',
      r.ordenCorteEstado ?? 'â€”',
      r.ordenReconexionEstado ?? 'â€”',
    );
    const row = ws.addRow(rowData);
    row.height = 18;
    const isAlt = i % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      const mesCols = periodos.length;
      if (colNum >= 8 && colNum <= 7 + mesCols) {
        const pagado = cell.value === 'SI';
        cell.fill = headerFill(pagado ? COLOR_PAGADO : COLOR_NO_PAGO);
        cell.font = { bold: true, color: { argb: pagado ? 'FF065F46' : 'FF991B1B' }, size: 9 };
      } else {
        cell.fill = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.font = { size: 9 };
        if (colNum === 1) cell.alignment.horizontal = 'left';
        if (colNum === 7 && r.tenencia === 'inquilino' && r.nombrePropietario) {
          cell.font = { size: 9, color: { argb: 'FFB45309' } };
          cell.alignment.horizontal = 'left';
        }
      }
    });

    const totalCol = 8 + periodos.length;
    const totalCell = row.getCell(totalCol);
    totalCell.numFmt = '"$"#,##0.00';
    totalCell.font   = { bold: true, color: { argb: 'FF065F46' }, size: 9 };

    const sinPagarCell = row.getCell(totalCol + 1);
    if (r.mesesSinPagar > 0) {
      sinPagarCell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 9 };
    }
  });

  // ── Resumen al final ──────────────────────────────────────────
  ws.addRow([]);
  const sumRow = ws.addRow([
    `Total residentes: ${params.residentes.length}`,
    '', '', '', '', '', '',
    ...periodos.map((_,idx) => {
      return params.residentes.filter(r => r.pagosAnio[idx]?.estado === 'pagado').length;
    }),
    params.residentes.reduce((s, r) => s + r.totalPagado, 0),
    params.residentes.reduce((s, r) => s + r.mesesSinPagar, 0),
    '',
  ]);
  sumRow.height = 20;
  sumRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum === 1 || colNum >= 8) {
      cell.fill   = headerFill('EFF6FF');
      cell.font   = { bold: true, size: 9, color: { argb: 'FF1E40AF' } };
      cell.border = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (colNum === 8 + periodos.length) cell.numFmt = '"$"#,##0.00';
  });
  ws.getCell(sumRow.number, 1).alignment = { horizontal: 'left' };

  // ── Anchos de columna ─────────────────────────────────────────
  ws.getColumn(1).width  = 22;
  ws.getColumn(2).width  = 14;
  ws.getColumn(3).width  = 9;
  ws.getColumn(4).width  = 9;
  ws.getColumn(5).width  = 14;
  ws.getColumn(6).width  = 12;
  ws.getColumn(7).width  = 28;
  for (let c = 8; c <= 7 + periodos.length; c++) ws.getColumn(c).width = 8;
  ws.getColumn(8 + periodos.length).width     = 11;
  ws.getColumn(8 + periodos.length + 1).width = 10;
  ws.getColumn(8 + periodos.length + 2).width = 13;

  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 3 }];

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

export interface IngresoAdicionalReporte {
  concepto: string;
  monto: string | number;
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
  fraccionamiento: string;
  mes: number;
  anio: number;
  generadoEn: Date;
  totalRecaudado: number;
  totalPagos?: number;
  totalEsperadoCargos?: number;
  saldoPendiente?: number;
  totalIngresosAdicionales?: number;
  totalResidentes: number;
  totalPagaron: number;
  totalMorosos: number;
  porcentajeCobranza: number;
  saldo: number;
  totalGastos: number;
  porEdificio: EdificioFinanciero[];
  gastos: GastoReporte[];
  ingresos?: IngresoAdicionalReporte[];
  pagos?: PagoReporteItem[];
  estadoServicios?: EstadoServicioReporteItem[];
  totalesPorServicio?: TotalPorServicio[];
  serviciosActivos?: string[];
}): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SISCO';
  wb.created = params.generadoEn;

  const mesNombre = MESES_ES[params.mes - 1];

  // ════════════════════════════════════════════
  // Hoja 1: Resumen  (2 columnas de datos)
  // ════════════════════════════════════════════
  const wsR = wb.addWorksheet('Resumen');
  agregarLogo(wb, wsR, 3); // logo en col D (índice 3), fuera del merge A1:C1
  wsR.mergeCells('A1:C1');
  const t = wsR.getCell('A1');
  t.value = `Reporte Financiero — ${params.fraccionamiento}`;
  t.font  = { bold: true, size: 16, color: { argb: 'FF' + COLOR_HEADER } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  wsR.getRow(1).height = 36;

  wsR.mergeCells('A2:C2');
  const sub = wsR.getCell('A2');
  sub.value = `Período: ${mesNombre} ${params.anio}   |   Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sub.font  = { size: 10, color: { argb: 'FF6B7280' } };
  sub.alignment = { horizontal: 'center' };
  wsR.getRow(2).height = 20;

  wsR.addRow([]);

  const serviceKpis: [string, string | number, string][] = (params.totalesPorServicio ?? []).map(s => [
    `    · ${s.servicio}`,
    s.total,
    '"$"#,##0.00',
  ]);

  const totalInsumos = (params.gastos ?? [])
    .filter(g => g.categoria?.toLowerCase() === 'insumos')
    .reduce((s, g) => s + Number(g.monto), 0);

  const kpis: [string, string | number, string][] = [
    ['Total Recaudado',         params.totalRecaudado,                     '"$"#,##0.00'],
    ['  · Pagos registrados',   params.totalPagos ?? params.totalRecaudado, '"$"#,##0.00'],
    ['Cargos esperados',        params.totalEsperadoCargos ?? 0,            '"$"#,##0.00'],
    ['Saldo pendiente',         params.saldoPendiente ?? 0,                 '"$"#,##0.00'],
    ...serviceKpis,
    ['Total Gastos',            params.totalGastos,                        '"$"#,##0.00'],
    ['  · Insumos',             totalInsumos,                              '"$"#,##0.00'],
    ['Saldo',                   params.saldo,                              '"$"#,##0.00'],
    ['% Cobranza',              params.porcentajeCobranza,                 '0.0"%"'],
    ['Total Residentes',        params.totalResidentes,                    '0'],
    ['Pagaron',                 params.totalPagaron,                       '0'],
    ['Morosos',                 params.totalMorosos,                       '0'],
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
    row.getCell(1).fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(1).font      = { bold: true, size: 10 };
    row.getCell(1).border    = border();
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(2).numFmt    = fmt;
    row.getCell(2).border    = border();
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    if (label === 'Saldo')                 row.getCell(2).font = { bold: true, color: { argb: params.saldo >= 0 ? 'FF065F46' : 'FF991B1B' }, size: 10 };
    else if (label === 'Total Recaudado')  row.getCell(2).font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
    else if (label === 'Total Gastos')     row.getCell(2).font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 };
    else if (label === '  · Insumos')      { row.getCell(1).font = { size: 9, italic: true }; row.getCell(2).font = { size: 9, italic: true, color: { argb: 'FF991B1B' } }; }
    else if (label === 'Morosos')          row.getCell(2).font = { bold: true, color: { argb: params.totalMorosos > 0 ? 'FF991B1B' : 'FF374151' }, size: 10 };
    else if (label.startsWith('    ·'))   { row.getCell(1).font = { size: 8.5, italic: true }; row.getCell(2).font = { size: 8.5, italic: true }; }
    else if (label.startsWith('  ·'))     { row.getCell(1).font = { size: 9, italic: true }; row.getCell(2).font = { size: 9, italic: true }; }
  });

  wsR.getColumn(1).width = 22;
  wsR.getColumn(2).width = 18;

  // ════════════════════════════════════════════
  // Hoja 2: Por Edificio  (5 columnas de datos)
  // ════════════════════════════════════════════
  const wsE = wb.addWorksheet('Por Edificio');
  agregarLogo(wb, wsE, 6); // logo en col G (índice 6), fuera del merge A1:F1

  wsE.mergeCells('A1:F1');
  const te = wsE.getCell('A1');
  te.value = `Cobranza por Edificio — ${mesNombre} ${params.anio}`;
  te.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  te.alignment = { horizontal: 'center', vertical: 'middle' };
  wsE.getRow(1).height = 36;
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
    const row = wsE.addRow([`Edif. ${ed.edificio}`, ed.totalPagado, ed.cantidadPagos, ed.residentesActivos, ed.residentesMorosos]);
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

  const eTotalRow = wsE.addRow(['TOTAL', params.totalRecaudado, params.totalPagaron, params.totalPagaron, params.totalMorosos]);
  eTotalRow.height = 20;
  eTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill      = headerFill('DBEAFE');
    cell.font      = { bold: true, size: 10, color: { argb: 'FF1E40AF' } };
    cell.border    = border();
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
  // Hoja 3: Pagos Registrados (Consolidado HU-S4-12)
  // ════════════════════════════════════════════
  agregarHojaPagos(
    wb,
    `Pagos Registrados — ${mesNombre} ${params.anio}`,
    `Período: ${mesNombre} ${params.anio}   |   Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    params.pagos ?? [],
    params.serviciosActivos,
    params.totalesPorServicio,
  );


  // ════════════════════════════════════════════
  // Hoja 4: Gastos  (4 columnas de datos)
  // ════════════════════════════════════════════
  const wsG = wb.addWorksheet('Gastos');
  agregarLogo(wb, wsG, 5); // logo en col F (índice 5), fuera del merge A1:E1

  wsG.mergeCells('A1:E1');
  const tg = wsG.getCell('A1');
  tg.value = `Gastos — ${mesNombre} ${params.anio}`;
  tg.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  tg.alignment = { horizontal: 'center', vertical: 'middle' };
  wsG.getRow(1).height = 36;
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
      const row = wsG.addRow([escapeExcelFormula(g.concepto), escapeExcelFormula(g.categoria), new Date(g.fecha).toLocaleDateString('es-MX'), Number(g.monto)]);
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
      cell.fill      = headerFill('FEE2E2');
      cell.font      = { bold: true, size: 10, color: { argb: 'FF991B1B' } };
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 4) cell.numFmt = '"$"#,##0.00';
    });
  }

  wsG.getColumn(1).width = 30;
  wsG.getColumn(2).width = 16;
  wsG.getColumn(3).width = 14;
  wsG.getColumn(4).width = 14;

  // ════════════════════════════════════════════
  // Hoja 5: Ingresos Adicionales  (3 columnas)
  // ════════════════════════════════════════════
  const wsI = wb.addWorksheet('Ingresos Adicionales');
  agregarLogo(wb, wsI, 4); // logo en col E (índice 4), fuera del merge A1:D1

  wsI.mergeCells('A1:D1');
  const ti = wsI.getCell('A1');
  ti.value = `Ingresos Adicionales — ${mesNombre} ${params.anio}`;
  ti.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  ti.alignment = { horizontal: 'center', vertical: 'middle' };
  wsI.getRow(1).height = 36;
  wsI.addRow([]);

  const ihRow = wsI.addRow(['Concepto', 'Fecha', 'Monto']);
  ihRow.height = 20;
  ihRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  const ingresos = params.ingresos ?? [];
  if (ingresos.length === 0) {
    const emptyRow = wsI.addRow(['Sin ingresos adicionales para este período', '', '']);
    wsI.mergeCells(emptyRow.number, 1, emptyRow.number, 3);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    ingresos.forEach((ing, i) => {
      const row = wsI.addRow([escapeExcelFormula(ing.concepto), new Date(ing.fecha).toLocaleDateString('es-MX'), Number(ing.monto)]);
      row.height = 18;
      const isAlt = i % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.border    = border();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font      = { size: 10 };
        if (colNum === 1) cell.alignment.horizontal = 'left';
        if (colNum === 3) { cell.numFmt = '"$"#,##0.00'; cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 }; }
      });
    });

    const totalIngresos = ingresos.reduce((s, i) => s + Number(i.monto), 0);
    const iTotalRow = wsI.addRow(['TOTAL INGRESOS ADICIONALES', '', totalIngresos]);
    iTotalRow.height = 20;
    iTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill('D1FAE5');
      cell.font      = { bold: true, size: 10, color: { argb: 'FF065F46' } };
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 3) cell.numFmt = '"$"#,##0.00';
    });
  }

  wsI.getColumn(1).width = 35;
  wsI.getColumn(2).width = 14;
  wsI.getColumn(3).width = 16;

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// ─────────────────────────────────────────────────────────────────
// REPORTE FINANCIERO — RANGO DE MESES
// ─────────────────────────────────────────────────────────────────

export interface MesResumen {
  mes:   number;
  anio:  number;
  totalPagos:               number;
  totalIngresosAdicionales: number;
  totalRecaudado:           number;
  totalGastos:              number;
  saldo:                    number;
  cantidadPagos:            number;
  totalEsperadoCargos?:     number;
  saldoPendiente?:          number;
}

export interface GastoRangoReporte extends GastoReporte {
  mes:  number;
  anio: number;
}

export interface IngresoRangoReporte extends IngresoAdicionalReporte {
  mes:  number;
  anio: number;
}

export async function generarReporteFinancieroRangoExcel(params: {
  fraccionamiento: string;
  mesDesde:    number;
  anioDesde:   number;
  mesHasta:    number;
  anioHasta:   number;
  generadoEn:  Date;
  totalRecaudado:            number;
  totalPagos:                number;
  totalEsperadoCargos?:      number;
  saldoPendiente?:           number;
  totalIngresosAdicionales:  number;
  totalGastos:               number;
  saldo:                     number;
  totalResidentes:           number;
  porEdificio:  EdificioFinanciero[];
  gastos:       GastoRangoReporte[];
  ingresos:     IngresoRangoReporte[];
  porMes:       MesResumen[];
  pagos?:       PagoReporteItem[];
  estadoServicios?: EstadoServicioReporteItem[];
  totalesPorServicio?: TotalPorServicio[];
  serviciosActivos?: string[];
}): Promise<Buffer> {
  const ExcelJS  = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SISCO';
  wb.created = params.generadoEn;

  const periodoLabel = params.mesDesde === params.mesHasta && params.anioDesde === params.anioHasta
    ? `${MESES_ES[params.mesDesde - 1]} ${params.anioDesde}`
    : `${MESES_ES[params.mesDesde - 1]} ${params.anioDesde} — ${MESES_ES[params.mesHasta - 1]} ${params.anioHasta}`;

  // ══════════════════════════════════════
  // Hoja 1: Resumen general
  // ══════════════════════════════════════
  const wsR = wb.addWorksheet('Resumen');
  agregarLogo(wb, wsR, 3);

  wsR.mergeCells('A1:C1');
  const t = wsR.getCell('A1');
  t.value = `Reporte Financiero — ${params.fraccionamiento}`;
  t.font  = { bold: true, size: 16, color: { argb: 'FF' + COLOR_HEADER } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  wsR.getRow(1).height = 36;

  wsR.mergeCells('A2:C2');
  const sub = wsR.getCell('A2');
  sub.value = `Período: ${periodoLabel}   |   Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sub.font  = { size: 10, color: { argb: 'FF6B7280' } };
  sub.alignment = { horizontal: 'center' };
  wsR.getRow(2).height = 20;

  wsR.addRow([]);

  const serviceKpis: [string, string | number, string][] = (params.totalesPorServicio ?? []).map(s => [
    `    · ${s.servicio}`,
    s.total,
    '"$"#,##0.00',
  ]);

  const totalInsumos = (params.gastos ?? [])
    .filter(g => g.categoria?.toLowerCase() === 'insumos')
    .reduce((s, g) => s + Number(g.monto), 0);

  const kpis: [string, string | number, string][] = [
    ['Total Recaudado',          params.totalRecaudado,           '"$"#,##0.00'],
    ['  · Pagos registrados',    params.totalPagos,               '"$"#,##0.00'],
    ['Cargos esperados',         params.totalEsperadoCargos ?? 0, '"$"#,##0.00'],
    ['Saldo pendiente',          params.saldoPendiente ?? 0,      '"$"#,##0.00'],
    ...serviceKpis,
    ['Total Gastos',             params.totalGastos,              '"$"#,##0.00'],
    ['  · Insumos',              totalInsumos,                    '"$"#,##0.00'],
    ['Saldo Acumulado',          params.saldo,                    '"$"#,##0.00'],
    ['Total Residentes',         params.totalResidentes,          '0'],
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
    row.getCell(1).fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(1).font      = { bold: !label.startsWith('  ·'), size: 10 };
    row.getCell(1).border    = border();
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(2).fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
    row.getCell(2).numFmt    = fmt;
    row.getCell(2).border    = border();
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    if (label === 'Saldo Acumulado')      row.getCell(2).font = { bold: true, color: { argb: params.saldo >= 0 ? 'FF065F46' : 'FF991B1B' }, size: 10 };
    else if (label === 'Total Recaudado') row.getCell(2).font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
    else if (label === 'Total Gastos')    row.getCell(2).font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 };
    else if (label === '  · Insumos')     { row.getCell(1).font = { size: 9, italic: true }; row.getCell(2).font = { size: 9, italic: true, color: { argb: 'FF991B1B' } }; }
    else if (label.startsWith('    ·'))  { row.getCell(1).font = { size: 8.5, italic: true }; row.getCell(2).font = { size: 8.5, italic: true }; }
    else if (label.startsWith('  ·'))    { row.getCell(1).font = { size: 9, italic: true }; row.getCell(2).font = { size: 9, italic: true }; }
  });

  wsR.getColumn(1).width = 26;
  wsR.getColumn(2).width = 18;

  // ══════════════════════════════════════
  // Hoja 2: Desglose por mes
  // ══════════════════════════════════════
  const wsM = wb.addWorksheet('Por Mes');
  agregarLogo(wb, wsM, 8);

  wsM.mergeCells('A1:H1');
  const tm = wsM.getCell('A1');
  tm.value = `Desglose Mensual — ${periodoLabel}`;
  tm.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  tm.alignment = { horizontal: 'center', vertical: 'middle' };
  wsM.getRow(1).height = 32;
  wsM.addRow([]);

  const mhRow = wsM.addRow(['Período', 'Cargos esperados', 'Pagos confirmados', '# Cobros', 'Total ingresos', 'Saldo pendiente', 'Gastos', 'Saldo de caja']);
  mhRow.height = 20;
  mhRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  params.porMes.forEach((m, i) => {
    const row = wsM.addRow([
      `${MESES_ES[m.mes - 1]} ${m.anio}`,
      m.totalEsperadoCargos ?? 0,
      m.totalPagos,
      m.cantidadPagos,
      m.totalRecaudado,
      m.saldoPendiente ?? 0,
      m.totalGastos,
      m.saldo,
    ]);
    row.height = 18;
    const isAlt = i % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font      = { size: 10 };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if ([2, 3, 5, 6, 7, 8].includes(colNum)) cell.numFmt = '"$"#,##0.00';
      if (colNum === 5) cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
      if (colNum === 7 && m.totalGastos > 0) cell.font = { color: { argb: 'FF991B1B' }, size: 10 };
      if (colNum === 8) {
        cell.numFmt = '"$"#,##0.00';
        cell.font   = { bold: true, color: { argb: m.saldo >= 0 ? 'FF065F46' : 'FF991B1B' }, size: 10 };
      }
    });
  });

  const mTotalRow = wsM.addRow([
    'TOTAL',
    params.totalEsperadoCargos ?? params.porMes.reduce((sum, m) => sum + (m.totalEsperadoCargos ?? 0), 0),
    params.totalPagos,
    params.porMes.reduce((s, m) => s + m.cantidadPagos, 0),
    params.totalRecaudado,
    params.saldoPendiente ?? params.porMes.reduce((sum, m) => sum + (m.saldoPendiente ?? 0), 0),
    params.totalGastos,
    params.saldo,
  ]);
  mTotalRow.height = 20;
  mTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill      = headerFill('DBEAFE');
    cell.font      = { bold: true, size: 10, color: { argb: 'FF1E40AF' } };
    cell.border    = border();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (colNum === 1) cell.alignment.horizontal = 'left';
    if ([2, 3, 5, 6, 7, 8].includes(colNum)) cell.numFmt = '"$"#,##0.00';
  });

  [18, 17, 17, 10, 18, 17, 14, 15].forEach((width, index) => { wsM.getColumn(index + 1).width = width; });

  // ══════════════════════════════════════
  // Hoja 3: Pagos Registrados (Consolidado HU-S4-12)
  // ══════════════════════════════════════
  agregarHojaPagos(
    wb,
    `Pagos Registrados — ${periodoLabel}`,
    `Período: ${periodoLabel}   |   Generado: ${params.generadoEn.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    params.pagos ?? [],
    params.serviciosActivos,
    params.totalesPorServicio,
  );
  agregarHojaEstadoServicios(wb, params.estadoServicios ?? []);

  // ══════════════════════════════════════
  // Hoja 4: Por Edificio (acumulado)
  // ══════════════════════════════════════
  const wsE = wb.addWorksheet('Por Edificio');
  agregarLogo(wb, wsE, 6);

  wsE.mergeCells('A1:F1');
  const te = wsE.getCell('A1');
  te.value = `Cobranza por Edificio — ${periodoLabel}`;
  te.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  te.alignment = { horizontal: 'center', vertical: 'middle' };
  wsE.getRow(1).height = 32;
  wsE.addRow([]);

  const ehRow = wsE.addRow(['Edificio', 'Recaudado', '# Pagos', 'Al corriente', 'Morosos']);
  ehRow.height = 20;
  ehRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  params.porEdificio.forEach((ed, i) => {
    const row = wsE.addRow([`Edif. ${ed.edificio}`, ed.totalPagado, ed.cantidadPagos, ed.residentesActivos, ed.residentesMorosos]);
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

  wsE.getColumn(1).width = 14;
  wsE.getColumn(2).width = 16;
  wsE.getColumn(3).width = 10;
  wsE.getColumn(4).width = 14;
  wsE.getColumn(5).width = 12;

  // ══════════════════════════════════════
  // Hoja 5: Gastos (todos en el rango)
  // ══════════════════════════════════════
  const wsG = wb.addWorksheet('Gastos');
  agregarLogo(wb, wsG, 6);

  wsG.mergeCells('A1:F1');
  const tg = wsG.getCell('A1');
  tg.value = `Gastos — ${periodoLabel}`;
  tg.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  tg.alignment = { horizontal: 'center', vertical: 'middle' };
  wsG.getRow(1).height = 32;
  wsG.addRow([]);

  const ghRow = wsG.addRow(['Período', 'Concepto', 'Categoría', 'Fecha', 'Monto']);
  ghRow.height = 20;
  ghRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  if (params.gastos.length === 0) {
    const emptyRow = wsG.addRow(['Sin gastos registrados en el período', '', '', '', '']);
    wsG.mergeCells(emptyRow.number, 1, emptyRow.number, 5);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    params.gastos.forEach((g, i) => {
      const row = wsG.addRow([
        `${MESES_ES[g.mes - 1]} ${g.anio}`,
        escapeExcelFormula(g.concepto),
        escapeExcelFormula(g.categoria),
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
        if ([1, 2].includes(colNum)) cell.alignment.horizontal = 'left';
        if (colNum === 5) { cell.numFmt = '"$"#,##0.00'; cell.font = { bold: true, color: { argb: 'FF991B1B' }, size: 10 }; }
      });
    });

    const gTotalRow = wsG.addRow(['TOTAL GASTOS', '', '', '', params.totalGastos]);
    gTotalRow.height = 20;
    gTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill('FEE2E2');
      cell.font      = { bold: true, size: 10, color: { argb: 'FF991B1B' } };
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 5) cell.numFmt = '"$"#,##0.00';
    });
  }

  wsG.getColumn(1).width = 14;
  wsG.getColumn(2).width = 30;
  wsG.getColumn(3).width = 16;
  wsG.getColumn(4).width = 14;
  wsG.getColumn(5).width = 14;

  // ══════════════════════════════════════
  // Hoja 6: Ingresos Adicionales (todos)
  // ══════════════════════════════════════
  const wsI2 = wb.addWorksheet('Ingresos Adicionales');
  agregarLogo(wb, wsI2, 5);

  wsI2.mergeCells('A1:E1');
  const ti = wsI2.getCell('A1');
  ti.value = `Ingresos Adicionales — ${periodoLabel}`;
  ti.font  = { bold: true, size: 14, color: { argb: 'FF' + COLOR_HEADER } };
  ti.alignment = { horizontal: 'center', vertical: 'middle' };
  wsI2.getRow(1).height = 32;
  wsI2.addRow([]);

  const ihRow = wsI2.addRow(['Período', 'Concepto', 'Fecha', 'Monto']);
  ihRow.height = 20;
  ihRow.eachCell(cell => {
    cell.fill      = headerFill(COLOR_HEADER);
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = border();
  });

  if (params.ingresos.length === 0) {
    const emptyRow = wsI2.addRow(['Sin ingresos adicionales en el período', '', '', '']);
    wsI2.mergeCells(emptyRow.number, 1, emptyRow.number, 4);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  } else {
    params.ingresos.forEach((ing, i) => {
      const row = wsI2.addRow([
        `${MESES_ES[ing.mes - 1]} ${ing.anio}`,
        escapeExcelFormula(ing.concepto),
        new Date(ing.fecha).toLocaleDateString('es-MX'),
        Number(ing.monto),
      ]);
      row.height = 18;
      const isAlt = i % 2 === 1;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill      = headerFill(isAlt ? COLOR_ROW_ALT : COLOR_WHITE);
        cell.border    = border();
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font      = { size: 10 };
        if ([1, 2].includes(colNum)) cell.alignment.horizontal = 'left';
        if (colNum === 4) { cell.numFmt = '"$"#,##0.00'; cell.font = { bold: true, color: { argb: 'FF065F46' }, size: 10 }; }
      });
    });

    const iTotalRow = wsI2.addRow(['TOTAL INGRESOS ADICIONALES', '', '', params.totalIngresosAdicionales]);
    iTotalRow.height = 20;
    iTotalRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = headerFill('D1FAE5');
      cell.font      = { bold: true, size: 10, color: { argb: 'FF065F46' } };
      cell.border    = border();
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNum === 1) cell.alignment.horizontal = 'left';
      if (colNum === 4) cell.numFmt = '"$"#,##0.00';
    });
  }

  wsI2.getColumn(1).width = 14;
  wsI2.getColumn(2).width = 35;
  wsI2.getColumn(3).width = 14;
  wsI2.getColumn(4).width = 16;

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
