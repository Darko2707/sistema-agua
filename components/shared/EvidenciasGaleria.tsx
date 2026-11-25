'use client';

import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { trpcReact } from '@/lib/trpc-react';

interface Props {
  ordenTrabajoId: string;
  titulo?: string;
}

export function EvidenciasGaleria({ ordenTrabajoId, titulo = 'Evidencias fotográficas' }: Props) {
  const query = trpcReact.operacion.evidenciasFotograficas.useQuery(
    { ordenTrabajoId },
    { enabled: Boolean(ordenTrabajoId) },
  );

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando evidencias...
      </div>
    );
  }

  if (query.error) {
    return (
      <p className="text-sm text-red-500 py-2">No se pudieron cargar las evidencias.</p>
    );
  }

  const evidencias = query.data?.evidencias ?? [];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        {titulo} ({evidencias.length})
      </h4>
      {evidencias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin evidencias fotográficas registradas.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {evidencias.map((ev) => (
            <div key={ev.id} className="group relative overflow-hidden rounded-lg border bg-muted">
              <img
                src={ev.viewUrl}
                alt={`Evidencia del ${new Date(ev.creadoEn).toLocaleDateString('es-MX')}`}
                className="h-36 w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-xs text-white">
                <p className="font-medium truncate">{ev.subidoPor.nombre}</p>
                <p className="text-white/80">{new Date(ev.creadoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
