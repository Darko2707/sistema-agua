'use client';

import { Image as ImageIcon } from 'lucide-react';

interface BitacoraEntry {
  id: string;
  accion: string;
  nota?: string | null;
  fotoUrl?: string | null;
  actorId?: string | null;
  creadoEn: Date | string;
}

interface Props {
  entradas: BitacoraEntry[];
  titulo?: string;
}

export function BitacoraFotos({ entradas, titulo = 'Fotografías de operación' }: Props) {
  const conFoto = entradas.filter((e) => Boolean(e.fotoUrl));

  if (conFoto.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        {titulo} ({conFoto.length})
      </h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {conFoto.map((entrada) => (
          <div key={entrada.id} className="group relative overflow-hidden rounded-lg border bg-muted">
            <img
              src={`/api/upload?ref=${encodeURIComponent(entrada.fotoUrl!)}`}
              alt={`${entrada.accion} — ${new Date(entrada.creadoEn).toLocaleDateString('es-MX')}`}
              className="h-36 w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-xs text-white">
              <p className="font-medium capitalize">{entrada.accion.replace(/_/g, ' ')}</p>
              <p className="text-white/80">{new Date(entrada.creadoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
