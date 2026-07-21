import fs from 'node:fs';
import path from 'node:path';
import { MESES_FULL as MESES } from '@/lib/meses';

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
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const BRAND   = rgb(0.08, 0.29, 0.23);
  const GOLD    = rgb(0.96, 0.70, 0.14);
  const GOLD_L  = rgb(0.98, 0.78, 0.31);
  const CREAM   = rgb(0.96, 0.93, 0.88);
  const CREAM_L = rgb(0.98, 0.96, 0.92);
  const WARM    = rgb(0.60, 0.56, 0.45);
  const GRAY    = rgb(0.55, 0.50, 0.39);
  const GRAY_L  = rgb(0.94, 0.90, 0.82);
  const BLACK   = rgb(0.23, 0.21, 0.16);
  const WHITE   = rgb(1, 1, 1);
  const GREEN   = rgb(0.08, 0.38, 0.23);

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

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, color: WHITE });
  page.drawRectangle({ x: 18, y: HEADER_Y, width: W - 36, height: HEADER_H, color: CREAM_L });
  page.drawRectangle({ x: 18, y: HEADER_Y, width: W - 36, height: 6, color: GOLD });

  if (logoImg) {
    const LOGO_S = 52;
    const LOGO_X = W - 74;
    const LOGO_Y = HEADER_Y + (HEADER_H - LOGO_S) / 2;
    page.drawCircle({ x: LOGO_X + LOGO_S / 2, y: LOGO_Y + LOGO_S / 2, size: 30, color: WHITE });
    page.drawImage(logoImg, { x: LOGO_X, y: LOGO_Y, width: LOGO_S, height: LOGO_S });
  }

  page.drawText('Comprobante de pago', {
    x: 28, y: HEADER_Y + 50, size: 19, font: bold, color: BRAND,
  });
  page.drawText(fraccionamiento, {
    x: 28, y: HEADER_Y + 28, size: 11, font, color: WARM,
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
    color: CREAM_L,
    borderColor: GRAY_L,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: 28, y: y - TOTAL_BOX_H + 14, width: 7, height: TOTAL_BOX_H,
    color: GOLD,
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
    x: 28, y: y - 156, width: BOX_W, height: 161,
    color: WHITE,
    borderColor: GRAY_L, borderWidth: 1,
  });
  page.drawRectangle({ x: 28, y: y - 21, width: BOX_W, height: 26, color: CREAM_L });
  page.drawText('Desglose del pago', { x: 42, y: y - 14, size: 11, font: bold, color: BRAND });

  const filas: [string, string | null | undefined][] = [
    ['Cuota del servicio',  data.montoBase],
    ['Comisión Mercado Pago', data.comisionMercadoPago],
    ['Retención ISR',       data.retencionIsr],
    ['Retención IVA',       data.retencionIva],
  ];
  let fy = y - 44;
  for (const [label, value] of filas) {
    page.drawText(label, { x: 42, y: fy, size: 9, font, color: WARM });
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
  // Position below the desglose box (bottom edge = y - 156) with margin
  const STAMP_Y = y - 156 - 22 - 36;
  const STAMP_X = W - 28 - 130;
  page.drawRectangle({
    x: STAMP_X, y: STAMP_Y, width: 130, height: 36,
    color: GREEN,
    borderColor: GOLD,
    borderWidth: 1.5,
  });
  // Checkmark: two lines forming a ✓
  page.drawLine({ start: { x: STAMP_X + 12, y: STAMP_Y + 18 }, end: { x: STAMP_X + 19, y: STAMP_Y + 11 }, thickness: 2, color: GOLD_L });
  page.drawLine({ start: { x: STAMP_X + 19, y: STAMP_Y + 11 }, end: { x: STAMP_X + 30, y: STAMP_Y + 23 }, thickness: 2, color: GOLD_L });
  page.drawText('PAGADO', {
    x: STAMP_X + 36, y: STAMP_Y + 13, size: 13, font: bold, color: GOLD_L,
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
