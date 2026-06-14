import { db } from '@/db'
import { tickets, pagos, departamentos, usuarios } from '@/db/schema'
import { eq } from 'drizzle-orm'

export default async function VerificarPage({
  params
}: {
  params: { folio: string }
}) {
  const ticket = await db.query.tickets.findFirst({
    where: (t, { eq }) => eq(t.folio, params.folio),
    with: {
      pago: {
        with: {
          departamento: {
            with: { residente: true }
          }
        }
      }
    }
  })

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="text-center space-y-2">
          <div className="text-5xl">❌</div>
          <h1 className="text-xl font-semibold text-destructive">Ticket no válido</h1>
          <p className="text-sm text-muted-foreground">
            El folio <strong>{params.folio}</strong> no existe en el sistema
          </p>
        </div>
      </div>
    )
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-semibold text-green-700">Ticket válido</h1>
          <p className="text-sm text-muted-foreground">Pago verificado correctamente</p>
        </div>
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Folio</span>
            <span className="font-mono font-medium">{ticket.folio}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Residente</span>
            <span className="font-medium">
              {ticket.pago?.departamento?.residente?.nombre ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Periodo</span>
            <span className="font-medium">
              {MESES[(ticket.pago?.mes ?? 1) - 1]} {ticket.pago?.anio}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monto</span>
            <span className="font-medium text-green-700">
              ${ticket.pago?.monto} MXN
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Emitido</span>
            <span className="font-medium">
              {ticket.emitidoEn?.toLocaleDateString('es-MX')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}