import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

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
  verificarUrl?: string;
}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 760]);
  const fraccionamiento = data.fraccionamiento ?? 'Sistema de Agua';
  const emailContacto = data.emailContacto ?? 'contacto@sistema-agua.local';
  const verificarUrl =
    data.verificarUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/verificar/${data.folio}`;

  const qrBuf = await QRCode.toBuffer(verificarUrl);
  const qrImg = await doc.embedPng(qrBuf);

  // Intentar incrustar el logo (no fatal si falta el archivo)
  let logoImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const logoBuf = fs.readFileSync(path.join(process.cwd(), 'public', 'logo2SIS4S.png'));
    logoImg = await doc.embedPng(logoBuf);
  } catch { /* logo opcional */ }

  page.drawRectangle({ x: 0, y: 690, width: 595, height: 70, color: rgb(0.04, 0.39, 0.58) });
  page.drawText('Comprobante de pago de agua', {
    x: 30,
    y: 725,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(fraccionamiento, {
    x: 30,
    y: 705,
    size: 11,
    font,
    color: rgb(0.86, 0.95, 1),
  });
  if (logoImg) {
    page.drawImage(logoImg, { x: 530, y: 695, width: 52, height: 52 });
  }

  page.drawText('Folio', { x: 30, y: 650, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(data.folio, { x: 30, y: 632, size: 15, font: bold });

  page.drawText('Circuito', { x: 300, y: 650, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(data.circuito ?? 'Sin circuito', { x: 300, y: 632, size: 14, font: bold });

  page.drawText('Residente', { x: 30, y: 595, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(data.nombre, { x: 30, y: 577, size: 14, font: bold });

  page.drawText('Vivienda', { x: 300, y: 595, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(
    `Edificio ${data.edificio ?? '-'} / Depto ${data.departamento ?? '-'}`,
    { x: 300, y: 577, size: 12, font: bold },
  );

  page.drawText('Periodo', { x: 30, y: 540, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(`${MESES[(data.mes ?? 1) - 1] ?? data.mes} ${data.anio}`, {
    x: 30,
    y: 522,
    size: 13,
    font: bold,
  });

  page.drawText('Monto total pagado', { x: 300, y: 540, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(`$${data.monto} MXN`, {
    x: 300,
    y: 516,
    size: 22,
    font: bold,
    color: rgb(0.04, 0.39, 0.58),
  });

  page.drawRectangle({
    x: 30,
    y: 270,
    width: 330,
    height: 205,
    borderColor: rgb(0.82, 0.86, 0.9),
    borderWidth: 1,
  });
  page.drawText('Desglose del pago', { x: 50, y: 445, size: 13, font: bold });

  const rows: [string, string | null | undefined][] = [
    ['Cuota del circuito', data.montoBase],
    ['IVA', data.iva],
    ['Comision Mercado Pago', data.comisionMercadoPago],
    ['Retencion ISR', data.retencionIsr],
    ['Retencion IVA', data.retencionIva],
  ];

  let y = 415;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 50, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(`$${Number(value ?? 0).toFixed(2)} MXN`, { x: 230, y, size: 10, font: bold });
    y -= 28;
  }

  page.drawLine({ start: { x: 50, y: 295 }, end: { x: 330, y: 295 }, thickness: 1, color: rgb(0.82, 0.86, 0.9) });
  page.drawText('Total', { x: 50, y: 275, size: 11, font: bold });
  page.drawText(`$${data.monto} MXN`, { x: 230, y: 275, size: 12, font: bold, color: rgb(0.04, 0.39, 0.58) });

  page.drawImage(qrImg, { x: 405, y: 325, width: 130, height: 130 });
  page.drawText('Codigo de verificacion', {
    x: 414,
    y: 305,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(data.folio, { x: 418, y: 288, size: 9, font: bold });

  page.drawText('Verificacion publica', { x: 30, y: 210, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(verificarUrl, { x: 30, y: 194, size: 9, font });

  page.drawText(`Contacto: ${emailContacto}`, { x: 30, y: 72, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
  page.drawText('Este comprobante corresponde al ticket registrado en el sistema.', {
    x: 30,
    y: 52,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return Buffer.from(await doc.save());
}
