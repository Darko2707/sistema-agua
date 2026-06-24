import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const BRAND   = rgb(0.04, 0.39, 0.58);
const BRAND_L = rgb(0.86, 0.95, 1);
const GRAY    = rgb(0.45, 0.45, 0.45);
const GRAY_L  = rgb(0.82, 0.86, 0.9);
const BLACK   = rgb(0.12, 0.12, 0.12);
const WHITE   = rgb(1, 1, 1);
const GREEN   = rgb(0.05, 0.60, 0.25);

export async function generarTicketPDF(data: {
  folio: string;
  fraccionamiento?: string;
  circuito?: string;
  nombre: string;
  edificio?: string;
  departamento?: string;
  mes: number;
  anio: number;
  monto: string;
  montoBase?: string | null;
  iva?: string | null;
  comisionMercadoPago?: string | null;
  retencionIsr?: string | null;
  retencionIva?: string | null;
  emailContacto?: string;
}) {
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // A4 portrait
  const W = 595;
  const H = 842;
  const page = doc.addPage([W, H]);

  const fraccionamiento = data.fraccionamiento ?? 'Sistema de Agua';
  const emailContacto   = data.emailContacto   ?? 'contacto@sistema-agua.local';

  // ── Logo ─────────────────────────────────────────────────────────────────────
  let logoImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const logoBuf = fs.readFileSync(path.join(process.cwd(), 'public', 'logo2SIS4S.png'));
    logoImg = await doc.embedPng(logoBuf);
  } catch { /* logo opcional */ }

  // ════════════════════════════════════════════════════════
  // CABECERA
  // ════════════════════════════════════════════════════════
  const HEADER_H = 80;
  const HEADER_Y = H - HEADER_H;

  page.drawRectangle({ x: 0, y: HEADER_Y, width: W, height: HEADER_H, color: BRAND });

  if (logoImg) {
    const LOGO_S = 52;
    const LOGO_X = W - 74;
    const LOGO_Y = HEADER_Y + (HEADER_H - LOGO_S) / 2;
    page.drawCircle({ x: LOGO_X + LOGO_S / 2, y: LOGO_Y + LOGO_S / 2, size: 30, color: WHITE });
    page.drawImage(logoImg, { x: LOGO_X, y: LOGO_Y, width: LOGO_S, height: LOGO_S });
  }

  page.drawText('Comprobante de pago', {
    x: 28, y: HEADER_Y + 50, size: 19, font: bold, color: WHITE,
  });
  page.drawText(fraccionamiento, {
    x: 28, y: HEADER_Y + 28, size: 11, font, color: BRAND_L,
  });

  // ════════════════════════════════════════════════════════
  // FOLIO + CIRCUITO
  // ════════════════════════════════════════════════════════
  let y = H - HEADER_H - 36;

  page.drawText('Folio', { x: 28, y, size: 8, font, color: GRAY });
  page.drawText('Circuito', { x: 220, y, size: 8, font, color: GRAY });
  y -= 18;
  page.drawText(data.folio, { x: 28, y, size: 14, font: bold, color: BLACK });
  page.drawText(data.circuito ?? 'Sin circuito', { x: 220, y, size: 13, font: bold, color: BLACK });

  y -= 20;
  page.drawLine({ start: { x: 28, y }, end: { x: W - 28, y }, thickness: 0.5, color: GRAY_L });
  y -= 22;

  // ════════════════════════════════════════════════════════
  // DATOS DEL RESIDENTE
  // ════════════════════════════════════════════════════════
  page.drawText('Residente', { x: 28, y, size: 8, font, color: GRAY });
  page.drawText('Vivienda', { x: 300, y, size: 8, font, color: GRAY });
  y -= 18;
  page.drawText(data.nombre, { x: 28, y, size: 13, font: bold, color: BLACK });
  page.drawText(
    `Edificio ${data.edificio ?? '-'} / Depto ${data.departamento ?? '-'}`,
    { x: 300, y, size: 12, font: bold, color: BLACK },
  );

  y -= 28;
  page.drawText('Periodo', { x: 28, y, size: 8, font, color: GRAY });
  y -= 18;
  page.drawText(`${MESES[(data.mes ?? 1) - 1]} ${data.anio}`, {
    x: 28, y, size: 13, font: bold, color: BLACK,
  });

  y -= 22;
  page.drawLine({ start: { x: 28, y }, end: { x: W - 28, y }, thickness: 0.5, color: GRAY_L });
  y -= 28;

  // ════════════════════════════════════════════════════════
  // MONTO TOTAL (destacado)
  // ════════════════════════════════════════════════════════
  const TOTAL_BOX_H = 62;
  page.drawRectangle({
    x: 28, y: y - TOTAL_BOX_H + 14, width: W - 56, height: TOTAL_BOX_H,
    color: rgb(0.94, 0.98, 1),
    borderColor: BRAND_L,
    borderWidth: 1,
  });
  page.drawText('Monto total pagado', {
    x: 44, y: y - 4, size: 9, font, color: GRAY,
  });
  page.drawText(`$${data.monto} MXN`, {
    x: 44, y: y - 30, size: 24, font: bold, color: BRAND,
  });
  y -= TOTAL_BOX_H + 28;

  // ════════════════════════════════════════════════════════
  // DESGLOSE (ancho completo)
  // ════════════════════════════════════════════════════════
  const BOX_W = W - 56;

  page.drawRectangle({
    x: 28, y: y - 180, width: BOX_W, height: 185,
    borderColor: GRAY_L, borderWidth: 1,
  });
  page.drawText('Desglose del pago', { x: 42, y: y - 18, size: 11, font: bold, color: BLACK });

  const filas: [string, string | null | undefined][] = [
    ['Cuota del circuito',    data.montoBase],
    ['IVA',                   data.iva],
    ['Comisión Mercado Pago', data.comisionMercadoPago],
    ['Retención ISR',         data.retencionIsr],
    ['Retención IVA',         data.retencionIva],
  ];
  let fy = y - 44;
  for (const [label, value] of filas) {
    page.drawText(label, { x: 42, y: fy, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(`$${Number(value ?? 0).toFixed(2)} MXN`, {
      x: 380, y: fy, size: 9, font: bold, color: BLACK,
    });
    fy -= 24;
  }
  page.drawLine({
    start: { x: 42, y: fy + 12 }, end: { x: 28 + BOX_W - 14, y: fy + 12 },
    thickness: 0.5, color: GRAY_L,
  });
  fy -= 10;
  page.drawText('Total', { x: 42, y: fy, size: 10, font: bold, color: BLACK });
  page.drawText(`$${data.monto} MXN`, { x: 380, y: fy, size: 11, font: bold, color: BRAND });

  // ════════════════════════════════════════════════════════
  // SELLO PAGADO
  // ════════════════════════════════════════════════════════
  const STAMP_Y = y - 195;
  page.drawRectangle({
    x: W - 120, y: STAMP_Y, width: 92, height: 28,
    color: GREEN,
  });
  page.drawText('✓  PAGADO', {
    x: W - 108, y: STAMP_Y + 9, size: 11, font: bold, color: WHITE,
  });

  // ════════════════════════════════════════════════════════
  // PIE DE PÁGINA
  // ════════════════════════════════════════════════════════
  page.drawLine({ start: { x: 28, y: 60 }, end: { x: W - 28, y: 60 }, thickness: 0.5, color: GRAY_L });
  page.drawText(`Contacto: ${emailContacto}`, {
    x: 28, y: 44, size: 8, font, color: GRAY,
  });
  page.drawText('Este comprobante corresponde al ticket registrado en el sistema.', {
    x: 28, y: 28, size: 8, font, color: rgb(0.6, 0.6, 0.6),
  });

  return Buffer.from(await doc.save());
}
