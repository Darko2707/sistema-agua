'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc-client';

type Solicitud = {
  id: string;
  perfilId: string;
  motivo: string;
  solicitadoEn: Date | string;
  valoresNuevos: Record<string, unknown>;
};

export default function SolicitudesPerfilPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      setSolicitudes(await trpc.usuarios.listarSolicitudesCambioPerfil.query() as Solicitud[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las solicitudes');
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function resolver(solicitudId: string, decision: 'aprobar' | 'rechazar') {
    setError('');
    try {
      await trpc.usuarios.resolverCambioPerfil.mutate({ solicitudId, decision });
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver la solicitud');
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Solicitudes de cambio de perfil</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {solicitudes.length === 0 && <p className="text-muted-foreground">No hay solicitudes pendientes.</p>}
      <ul className="space-y-3">
        {solicitudes.map(solicitud => (
          <li key={solicitud.id} className="rounded-lg border p-4">
            <p className="text-sm"><strong>Perfil:</strong> {solicitud.perfilId}</p>
            <p className="text-sm"><strong>Motivo:</strong> {solicitud.motivo}</p>
            <pre className="my-3 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(solicitud.valoresNuevos, null, 2)}</pre>
            <div className="flex gap-2">
              <button onClick={() => void resolver(solicitud.id, 'aprobar')} className="rounded bg-primary px-3 py-2 text-primary-foreground">Aprobar</button>
              <button onClick={() => void resolver(solicitud.id, 'rechazar')} className="rounded border px-3 py-2">Rechazar</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
