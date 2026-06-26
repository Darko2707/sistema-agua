import type { PDFPage, PDFFont, RGB } from 'pdf-lib';
import { MESES_CORTO as MESES, MESES_FULL } from '@/lib/meses';

type Colors = {
  HEADER: RGB; ALT_ROW: RGB; GRAY: RGB; LIGHT: RGB;
  GREEN: RGB; RED: RGB; WHITE: RGB;
};

function mxn(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function estadoLabel(e: string) {
  return e === 'activo' ? 'Activo'
       : e === 'pendiente_corte' ? 'Pte. Corte'
       : e === 'cortado' ? 'Cortado'
       : 'Pte. Reconex.';
}

function estadoBadge(
  page: PDFPage, x: number, y: number, estado: string, font: PDFFont,
  rgb: (r: number, g: number, b: number) => RGB,
) {
  const color = estado === 'activo' ? rgb(0.08, 0.60, 0.31)
              : estado === 'cortado' ? rgb(0.80, 0.15, 0.15)
              : rgb(0.85, 0.55, 0.05);
  const label = estadoLabel(estado);
  const w = 58;
  page.drawRectangle({ x, y: y - 2, width: w, height: 11, color: color, opacity: 0.12 });
  page.drawText(label, { x: x + 2, y, size: 6.5, font, color });
}

// ─────────────────────────────────────────────────────────────────────────
// REPORTE DE RESIDENTES (landscape A4)
// ─────────────────────────────────────────────────────────────────────────
export async function generarReporteResidentesPDF(data: {
  circuito: string;
  generadoEn: Date;
  residentes: Array<{
    nombre: string;
    telefono: string;
    edificio: string;
    departamento: string;
    estadoAgua: string;
    pagosAnio: Array<{ mes: number; anio: number; monto: number | null; estado: string }>;
    totalPagado: number;
    mesesSinPagar: number;
    ultimoPago: Date | null;
  }>;
}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const C: Colors = {
    HEADER: rgb(0.04, 0.39, 0.58), ALT_ROW: rgb(0.95, 0.97, 0.99),
    GRAY:   rgb(0.45, 0.45, 0.45), LIGHT:   rgb(0.82, 0.86, 0.90),
    GREEN:  rgb(0.08, 0.60, 0.31), RED:     rgb(0.80, 0.15, 0.15),
    WHITE:  rgb(1, 1, 1),
  };
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Landscape A4: 842 x 595
  const W = 842, H = 595;
  const MARGIN = 24;
  const ROW_H  = 18;
  const HEADER_H = 54;

  // Columnas fijas
  const COL_NOMBRE  = 100;
  const COL_TEL     = 70;
  const COL_EDIF    = 42;
  const COL_DEPTO   = 40;
  const COL_ESTADO  = 62;
  // 12 meses — space available
  const COL_MES     = 34;
  const COL_TOTAL   = 52;
  const COL_SINPAGAR = 36;

  const totalFixedW = MARGIN * 2 + COL_NOMBRE + COL_TEL + COL_EDIF + COL_DEPTO + COL_ESTADO + COL_MES * 12 + COL_TOTAL + COL_SINPAGAR;
  // We'll work with fixed widths, content will clip

  function addPage() {
    const page = doc.addPage([W, H]);
    // Header bar
    page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: C.HEADER });
    page.drawText('Reporte de Residentes', { x: MARGIN, y: H - 24, size: 16, font: bold, color: C.WHITE });
    page.drawText(`Circuito: ${data.circuito}`, { x: MARGIN, y: H - 40, size: 10, font, color: rgb(0.8, 0.93, 1) });
    const fecha = data.generadoEn.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    page.drawText(`Generado: ${fecha}`, { x: W - MARGIN - 180, y: H - 32, size: 9, font, color: rgb(0.8, 0.93, 1) });
    return page;
  }

  function drawTableHeader(page: PDFPage, y: number) {
    const cols = buildCols();
    page.drawRectangle({ x: MARGIN, y: y - 2, width: W - MARGIN * 2, height: 14, color: rgb(0.15, 0.22, 0.35) });
    let x = MARGIN;
    for (const col of cols) {
      page.drawText(col.label, { x: x + 2, y, size: 6.5, font: bold, color: C.WHITE });
      x += col.w;
    }
  }

  // Build columns descriptor (label + width)
  function buildCols() {
    const periodos = data.residentes[0]?.pagosAnio ?? [];
    const mesHeaders = periodos.map(p => ({ label: MESES[p.mes - 1], w: COL_MES }));
    return [
      { label: 'Nombre', w: COL_NOMBRE },
      { label: 'Teléfono', w: COL_TEL },
      { label: 'Edif.', w: COL_EDIF },
      { label: 'Depto.', w: COL_DEPTO },
      { label: 'Estado', w: COL_ESTADO },
      ...mesHeaders,
      { label: 'Total 12m', w: COL_TOTAL },
      { label: 'Sin pagar', w: COL_SINPAGAR },
    ];
  }

  let page = addPage();
  let y    = H - HEADER_H - 10;
  drawTableHeader(page, y);
  y -= ROW_H;

  for (let i = 0; i < data.residentes.length; i++) {
    const r = data.residentes[i];

    // New page check (leave room for footer)
    if (y < MARGIN + 20) {
      page = addPage();
      y = H - HEADER_H - 10;
      drawTableHeader(page, y);
      y -= ROW_H;
    }

    // Alternate row background
    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 4, width: W - MARGIN * 2, height: ROW_H - 2, color: C.ALT_ROW });
    }

    let x = MARGIN;
    // Nombre
    page.drawText(r.nombre.slice(0, 22), { x: x + 2, y, size: 7, font });
    x += COL_NOMBRE;
    // Teléfono
    page.drawText(r.telefono.slice(0, 14), { x: x + 2, y, size: 7, font, color: C.GRAY });
    x += COL_TEL;
    // Edificio
    page.drawText(r.edificio.slice(0, 6), { x: x + 2, y, size: 7, font });
    x += COL_EDIF;
    // Departamento
    page.drawText(r.departamento.slice(0, 6), { x: x + 2, y, size: 7, font });
    x += COL_DEPTO;
    // Estado
    estadoBadge(page, x + 2, y, r.estadoAgua, bold, rgb);
    x += COL_ESTADO;

    // 12 meses
    for (const p of r.pagosAnio) {
      if (p.estado === 'pagado') {
        page.drawRectangle({ x: x + 9, y: y - 1, width: 14, height: 9, color: C.GREEN });
        page.drawText('SI', { x: x + 11, y: y + 1, size: 6, font: bold, color: C.WHITE });
      } else {
        page.drawRectangle({ x: x + 9, y: y - 1, width: 14, height: 9, color: C.LIGHT });
        page.drawText('NO', { x: x + 10, y: y + 1, size: 5.5, font, color: C.WHITE });
      }
      x += COL_MES;
    }

    // Total pagado
    page.drawText(mxn(r.totalPagado), { x: x + 2, y, size: 7, font: bold, color: C.GREEN });
    x += COL_TOTAL;

    // Meses sin pagar
    const sinPagar = r.mesesSinPagar;
    const sinPagarColor = sinPagar === 0 ? C.GREEN : sinPagar > 2 ? C.RED : C.GRAY;
    page.drawText(String(sinPagar), { x: x + 16, y, size: 7, font: bold, color: sinPagarColor });

    y -= ROW_H;
  }

  // Footer
  const totalPages = doc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const pg = doc.getPage(i);
    pg.drawText(`Página ${i + 1} de ${totalPages}`, {
      x: W - MARGIN - 80, y: MARGIN - 5, size: 8, font, color: C.GRAY,
    });
    pg.drawLine({
      start: { x: MARGIN, y: MARGIN + 4 }, end: { x: W - MARGIN, y: MARGIN + 4 },
      thickness: 0.5, color: C.LIGHT,
    });
  }

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────
// REPORTE FINANCIERO (portrait A4)
// ─────────────────────────────────────────────────────────────────────────
export async function generarReporteFinancieroPDF(data: {
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
  porEdificio: Array<{
    edificio: string;
    totalPagado: number;
    cantidadPagos: number;
    residentesActivos: number;
    residentesMorosos: number;
  }>;
  gastos: Array<{
    concepto: string;
    monto: string;
    categoria: string;
    fecha: Date;
  }>;
}) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const C: Colors = {
    HEADER: rgb(0.04, 0.39, 0.58), ALT_ROW: rgb(0.95, 0.97, 0.99),
    GRAY:   rgb(0.45, 0.45, 0.45), LIGHT:   rgb(0.82, 0.86, 0.90),
    GREEN:  rgb(0.08, 0.60, 0.31), RED:     rgb(0.80, 0.15, 0.15),
    WHITE:  rgb(1, 1, 1),
  };
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595, H = 842;
  const MARGIN = 36;

  const page = doc.addPage([W, H]);

  // ── Header ──
  page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: C.HEADER });
  page.drawText('Reporte Financiero', { x: MARGIN, y: H - 32, size: 20, font: bold, color: C.WHITE });
  page.drawText(`Circuito: ${data.circuito}`, { x: MARGIN, y: H - 52, size: 11, font, color: rgb(0.8, 0.93, 1) });
  const periodo = `${MESES_FULL[data.mes - 1]} ${data.anio}`;
  page.drawText(periodo, { x: W - MARGIN - 120, y: H - 38, size: 13, font: bold, color: C.WHITE });
  const fecha = data.generadoEn.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  page.drawText(`Generado: ${fecha}`, { x: W - MARGIN - 140, y: H - 56, size: 8, font, color: rgb(0.7, 0.85, 0.95) });

  let y = H - 100;

  // ── KPI Cards (2 rows × 2 cols) ──
  function kpiCard(lbl: string, val: string, cx: number, cy: number, w = 120, color = C.HEADER) {
    page.drawRectangle({ x: cx, y: cy - 36, width: w, height: 46, borderColor: C.LIGHT, borderWidth: 1 });
    page.drawText(lbl, { x: cx + 6, y: cy + 4, size: 8, font, color: C.GRAY });
    page.drawText(val, { x: cx + 6, y: cy - 22, size: 13, font: bold, color });
  }

  const CW = (W - MARGIN * 2 - 12) / 4;
  kpiCard('Total recaudado', mxn(data.totalRecaudado), MARGIN, y, CW, C.GREEN);
  kpiCard('Total residentes', String(data.totalResidentes), MARGIN + CW + 4, y, CW);
  kpiCard('Pagaron este mes', String(data.totalPagaron), MARGIN + (CW + 4) * 2, y, CW, C.GREEN);
  kpiCard('Morosos', String(data.totalMorosos), MARGIN + (CW + 4) * 3, y, CW, data.totalMorosos > 0 ? C.RED : C.GREEN);
  y -= 56;

  kpiCard('% Cobranza', `${data.porcentajeCobranza.toFixed(1)}%`, MARGIN, y, CW, data.porcentajeCobranza >= 80 ? C.GREEN : C.RED);
  kpiCard('Total gastos', mxn(data.totalGastos), MARGIN + CW + 4, y, CW, C.RED);
  kpiCard('Saldo neto', mxn(data.saldo), MARGIN + (CW + 4) * 2, y, CW * 2 + 4, data.saldo >= 0 ? C.GREEN : C.RED);
  y -= 60;

  // ── Desglose por edificio ──
  page.drawText('Desglose por Edificio', { x: MARGIN, y, size: 12, font: bold, color: C.HEADER });
  y -= 16;

  // Table header
  const COL_ED = 80, COL_PAG = 90, COL_CANT = 70, COL_ACT = 80, COL_MOR = 80;
  page.drawRectangle({ x: MARGIN, y: y - 2, width: W - MARGIN * 2, height: 14, color: rgb(0.15, 0.22, 0.35) });
  page.drawText('Edificio',    { x: MARGIN + 4, y, size: 8, font: bold, color: C.WHITE });
  page.drawText('Total pagado', { x: MARGIN + COL_ED + 4, y, size: 8, font: bold, color: C.WHITE });
  page.drawText('# Pagos',     { x: MARGIN + COL_ED + COL_PAG + 4, y, size: 8, font: bold, color: C.WHITE });
  page.drawText('Activos',     { x: MARGIN + COL_ED + COL_PAG + COL_CANT + 4, y, size: 8, font: bold, color: C.WHITE });
  page.drawText('Morosos',     { x: MARGIN + COL_ED + COL_PAG + COL_CANT + COL_ACT + 4, y, size: 8, font: bold, color: C.WHITE });
  y -= 18;

  for (let i = 0; i < data.porEdificio.length; i++) {
    const ed = data.porEdificio[i];
    if (i % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - 4, width: W - MARGIN * 2, height: 16, color: C.ALT_ROW });
    let x = MARGIN + 4;
    page.drawText(ed.edificio,              { x, y, size: 9, font });       x += COL_ED;
    page.drawText(mxn(ed.totalPagado),      { x, y, size: 9, font: bold, color: C.GREEN }); x += COL_PAG;
    page.drawText(String(ed.cantidadPagos), { x, y, size: 9, font });       x += COL_CANT;
    page.drawText(String(ed.residentesActivos), { x, y, size: 9, font, color: C.GREEN });  x += COL_ACT;
    page.drawText(String(ed.residentesMorosos), { x, y, size: 9, font, color: ed.residentesMorosos > 0 ? C.RED : C.GRAY });
    y -= 18;
  }

  y -= 12;

  // ── Gastos ──
  page.drawText('Gastos del Período', { x: MARGIN, y, size: 12, font: bold, color: C.HEADER });
  y -= 16;

  if (data.gastos.length === 0) {
    page.drawText('Sin gastos registrados para este período.', { x: MARGIN + 4, y, size: 9, font, color: C.GRAY });
    y -= 18;
  } else {
    const COL_GCONC = 200, COL_GCAT = 100, COL_GFECH = 80, COL_GMONT = 90;
    page.drawRectangle({ x: MARGIN, y: y - 2, width: W - MARGIN * 2, height: 14, color: rgb(0.15, 0.22, 0.35) });
    page.drawText('Concepto',  { x: MARGIN + 4, y, size: 8, font: bold, color: C.WHITE });
    page.drawText('Categoría', { x: MARGIN + COL_GCONC + 4, y, size: 8, font: bold, color: C.WHITE });
    page.drawText('Fecha',     { x: MARGIN + COL_GCONC + COL_GCAT + 4, y, size: 8, font: bold, color: C.WHITE });
    page.drawText('Monto',     { x: MARGIN + COL_GCONC + COL_GCAT + COL_GFECH + 4, y, size: 8, font: bold, color: C.WHITE });
    y -= 18;

    const catLabel: Record<string, string> = {
      mantenimiento: 'Mantenimiento',
      administracion: 'Administración',
      servicios: 'Servicios',
      otros: 'Otros',
    };

    for (let i = 0; i < data.gastos.length; i++) {
      const g = data.gastos[i];
      if (i % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - 4, width: W - MARGIN * 2, height: 16, color: C.ALT_ROW });
      let x = MARGIN + 4;
      page.drawText(g.concepto.slice(0, 36),        { x, y, size: 9, font });                x += COL_GCONC;
      page.drawText(catLabel[g.categoria] ?? g.categoria, { x, y, size: 9, font, color: C.GRAY }); x += COL_GCAT;
      page.drawText(new Date(g.fecha).toLocaleDateString('es-MX'), { x, y, size: 9, font }); x += COL_GFECH;
      page.drawText(mxn(Number(g.monto)), { x, y, size: 9, font: bold, color: C.RED });
      y -= 18;
    }

    // Total gastos
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: W - MARGIN, y }, thickness: 0.5, color: C.LIGHT });
    y -= 12;
    page.drawText('Total gastos:', { x: MARGIN + COL_GCONC + COL_GCAT + COL_GFECH + 4 - 70, y, size: 10, font: bold });
    page.drawText(mxn(data.totalGastos), { x: MARGIN + COL_GCONC + COL_GCAT + COL_GFECH + 4, y, size: 10, font: bold, color: C.RED });
    y -= 20;
  }

  // ── Saldo final ──
  y -= 8;
  page.drawRectangle({ x: MARGIN, y: y - 8, width: W - MARGIN * 2, height: 34, color: data.saldo >= 0 ? rgb(0.9, 0.98, 0.93) : rgb(0.99, 0.93, 0.93) });
  page.drawText('Saldo final (Recaudado - Gastos):', { x: MARGIN + 8, y: y + 12, size: 10, font: bold });
  page.drawText(mxn(data.saldo), {
    x: MARGIN + 8, y: y - 4, size: 16, font: bold,
    color: data.saldo >= 0 ? C.GREEN : C.RED,
  });

  // Footer
  page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: W - MARGIN, y: 30 }, thickness: 0.5, color: C.LIGHT });
  page.drawText('Página 1 de 1', { x: W - MARGIN - 60, y: 16, size: 8, font, color: C.GRAY });

  return Buffer.from(await doc.save());
}
