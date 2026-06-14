import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

export async function generarTicketPDF(data: {
  folio:  string
  nombre: string
  mes:    number
  anio:   number
  monto:  string
}) {
  const doc  = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([595, 420])

  const qrBuf = await QRCode.toBuffer(
    `${process.env.NEXT_PUBLIC_APP_URL}/verificar/${data.folio}`
  )
  const qrImg = await doc.embedPng(qrBuf)

  // Encabezado
  page.drawRectangle({ x: 0, y: 370, width: 595, height: 50,
    color: rgb(0.07, 0.43, 0.29) })
  page.drawText('Comprobante de Pago — Agua Fraccionamiento',
    { x: 30, y: 388, size: 14, font: bold, color: rgb(1,1,1) })

  // Datos
  page.drawText(`Folio:`,      { x: 30, y: 340, size: 10, font, color: rgb(0.4,0.4,0.4) })
  page.drawText(data.folio,    { x: 30, y: 325, size: 12, font: bold })
  page.drawText(`Residente:`,  { x: 30, y: 295, size: 10, font, color: rgb(0.4,0.4,0.4) })
  page.drawText(data.nombre,   { x: 30, y: 280, size: 12, font: bold })
  page.drawText(`Periodo:`,    { x: 30, y: 250, size: 10, font, color: rgb(0.4,0.4,0.4) })
  page.drawText(`${data.mes}/${data.anio}`, { x: 30, y: 235, size: 12, font: bold })
  page.drawText(`Monto pagado:`, { x: 30, y: 205, size: 10, font, color: rgb(0.4,0.4,0.4) })
  page.drawText(`$${data.monto} MXN`,
    { x: 30, y: 188, size: 18, font: bold, color: rgb(0.07, 0.43, 0.29) })

  // QR
  page.drawImage(qrImg, { x: 430, y: 200, width: 130, height: 130 })
  page.drawText('Escanea para verificar',
    { x: 438, y: 188, size: 8, font, color: rgb(0.5,0.5,0.5) })

  return Buffer.from(await doc.save())
}