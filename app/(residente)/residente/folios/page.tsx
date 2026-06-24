'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

type Ticket = {
  id: string;
  folio: string;
  emitidoEn: string | Date | null;
  pago?: {
    mes: number;
    anio: number;
    monto: string;
    estado: string | null;
    montoBase: string | null;
    iva: string | null;
    comisionMercadoPago: string | null;
    retencionIsr: string | null;
    retencionIva: string | null;
    circuito?: { nombre: string } | null;
    perfil?: {
      edificio: string;
      departamento: string;
      usuario?: { name: string } | null;
    } | null;
  } | null;
};

function money(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

export default function FoliosPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    trpc.tickets.misTickets
      .query()
      .then((data) => setTickets(data as Ticket[]))
      .catch((err) => {
        console.error(err);
        setError('No se pudieron cargar tus folios');
      })
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Recibos</h1>
              <p className="mt-1 text-sky-100">Recibos y comprobantes PDF de tus pagos</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push('/residente')}
              className="bg-white/20 text-white hover:bg-white/30"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {tickets.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No tienes recibos registrados todavia.
              </CardContent>
            </Card>
          )}

          {tickets.map((ticket) => {
            const pago = ticket.pago;
            const periodo = pago ? `${MESES[pago.mes - 1]} ${pago.anio}` : 'Sin periodo';

            return (
              <Card key={ticket.id}>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-100">
                      <FileText className="h-5 w-5 text-sky-700" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{ticket.folio}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {periodo} · {pago?.circuito?.nombre ?? 'Sin circuito'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={pago?.estado === 'pagado' ? 'default' : 'outline'}>
                    {pago?.estado ?? 'ticket'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground">Residente</p>
                      <p className="font-medium">{pago?.perfil?.usuario?.name ?? 'Residente'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Vivienda</p>
                      <p className="font-medium">
                        Edificio {pago?.perfil?.edificio ?? '-'} / Depto {pago?.perfil?.departamento ?? '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Monto total</p>
                      <p className="font-semibold text-sky-700">{money(pago?.monto)}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border bg-slate-50 p-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground">Cuota</p>
                      <p className="font-medium">{money(pago?.montoBase)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Comisión MP</p>
                      <p className="font-medium">{money(pago?.comisionMercadoPago)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Ret. ISR + IVA</p>
                      <p className="font-medium">
                        {money((Number(pago?.retencionIsr ?? 0) + Number(pago?.retencionIva ?? 0)).toFixed(2))}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild className="sm:w-auto">
                      <a href={`/api/tickets/${ticket.folio}/pdf`} download={`recibo-${ticket.folio}.pdf`}>
                        <Download className="mr-2 h-4 w-4" />
                        Descargar recibo
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
