import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Scissors, RotateCcw } from 'lucide-react';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';
import type { ResidenteCompleto } from '@/hooks/useAdmin';

type Props = {
  pendientesCorte:      ResidenteCompleto[];
  pendientesReconexion: ResidenteCompleto[];
};

export function PendientesTab({ pendientesCorte, pendientesReconexion }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-red-600" />
            Pendientes de corte
          </CardTitle>
          <Badge variant="destructive">{pendientesCorte.length}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendientesCorte.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">Sin pendientes de corte</p>
          )}
          {pendientesCorte.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                <p className="text-sm text-muted-foreground">
                  {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                </p>
                <EstadoAguaBadge estado="pendiente_corte" className="mt-1" />
              </div>
              <p className="text-sm text-muted-foreground">Debe el mes — esperando cuadrilla</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            Pendientes de reconexión
          </CardTitle>
          <Badge variant="outline" className="border-amber-300 text-amber-600">
            {pendientesReconexion.length}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendientesReconexion.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">Sin reconexiones pendientes</p>
          )}
          {pendientesReconexion.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                <p className="text-sm text-muted-foreground">
                  {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                </p>
                <EstadoAguaBadge estado="pendiente_reconexion" className="mt-1" />
              </div>
              <p className="text-sm text-muted-foreground">Pagó reconexión — esperando cuadrilla</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
