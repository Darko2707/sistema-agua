import { db } from '@/db';
import { tickets, pagos, perfilesResidente, user } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { MESES_FULL } from '@/lib/meses';

export default async function VerificarPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio } = await params;
  const ticket = await db.query.tickets.findFirst({
    where: (t, { eq }) => eq(t.folio, folio),
    with: {
      pago: {
        with: {
          perfil: {
            with: {
              usuario: true, // esto es la tabla user
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="text-center space-y-2">
          <div className="text-5xl">❌</div>
          <h1 className="text-xl font-semibold text-destructive">Ticket no válido</h1>
          <p className="text-sm text-muted-foreground">
            El folio <strong>{folio}</strong> no existe en el sistema
          </p>
        </div>
      </div>
    );
  }

  const MESES = MESES_FULL;

  const pago = ticket.pago;
  const perfil = pago?.perfil;
  const residente = perfil?.usuario;

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
            <span className="font-medium">{residente?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Periodo</span>
            <span className="font-medium">
              {MESES[(pago?.mes ?? 1) - 1]} {pago?.anio}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Monto</span>
            <span className="font-medium text-green-700">${pago?.monto} MXN</span>
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
  );
}