'use client';

import { FormEvent, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc-client';

type Perfil = {
  telefono?: string | null;
  sexo?: string | null;
  tenencia?: string | null;
  edificio?: string | null;
  departamento?: string | null;
  nombrePropietario?: string | null;
  telefonoPropietario?: string | null;
};

export default function PerfilResidentePage() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [solicitudes, setSolicitudes] = useState<Array<{ estado: string; motivo: string }>>([]);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      trpc.usuarios.miPerfil.query(),
      trpc.usuarios.misSolicitudesCambioPerfil.query(),
    ]).then(([actual, pendientes]) => {
      setPerfil(actual as Perfil | null);
      setSolicitudes(pendientes as typeof solicitudes);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el perfil'));
  }, []);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!perfil) return;
    const form = new FormData(event.currentTarget);
    setMensaje('');
    setError('');
    try {
      await trpc.usuarios.solicitarCambioPerfil.mutate({
        motivo,
        cambios: {
          telefono: String(form.get('telefono') ?? ''),
          sexo: String(form.get('sexo') ?? '') as 'masculino' | 'femenino' | 'otro',
          tenencia: String(form.get('tenencia') ?? '') as 'propietario' | 'inquilino',
          edificio: String(form.get('edificio') ?? ''),
          departamento: String(form.get('departamento') ?? ''),
          nombrePropietario: String(form.get('nombrePropietario') ?? '') || null,
          telefonoPropietario: String(form.get('telefonoPropietario') ?? '') || null,
        },
      });
      setMensaje('Solicitud enviada al representante.');
      setMotivo('');
      setSolicitudes(await trpc.usuarios.misSolicitudesCambioPerfil.query() as typeof solicitudes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud');
    }
  }

  if (!perfil) return <main className="p-6">Cargando perfil…</main>;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Solicitar cambio de perfil</h1>
      <p className="text-sm text-muted-foreground">Los cambios requieren aprobación del representante de tu circuito.</p>
      {mensaje && <p role="status" className="text-green-700">{mensaje}</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <form onSubmit={enviar} className="grid gap-4 rounded-lg border p-4">
        <label>Teléfono<input name="telefono" defaultValue={perfil.telefono ?? ''} className="w-full rounded border p-2" /></label>
        <label>Sexo<select name="sexo" defaultValue={perfil.sexo ?? ''} className="w-full rounded border p-2"><option value="">Selecciona</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option><option value="otro">Otro</option></select></label>
        <label>Tenencia<select name="tenencia" defaultValue={perfil.tenencia ?? ''} className="w-full rounded border p-2"><option value="">Selecciona</option><option value="propietario">Propietario</option><option value="inquilino">Inquilino</option></select></label>
        <label>Edificio<input name="edificio" defaultValue={perfil.edificio ?? ''} className="w-full rounded border p-2" /></label>
        <label>Departamento<input name="departamento" defaultValue={perfil.departamento ?? ''} className="w-full rounded border p-2" /></label>
        <label>Nombre del propietario<input name="nombrePropietario" defaultValue={perfil.nombrePropietario ?? ''} className="w-full rounded border p-2" /></label>
        <label>Teléfono del propietario<input name="telefonoPropietario" defaultValue={perfil.telefonoPropietario ?? ''} className="w-full rounded border p-2" /></label>
        <label>Motivo<textarea value={motivo} onChange={e => setMotivo(e.target.value)} required minLength={3} maxLength={500} className="w-full rounded border p-2" /></label>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-primary-foreground">Enviar solicitud</button>
      </form>
      <section>
        <h2 className="font-semibold">Historial de solicitudes</h2>
        <ul className="mt-2 space-y-2 text-sm">{solicitudes.map((s, i) => <li key={`${s.estado}-${i}`} className="rounded border p-2">{s.estado}: {s.motivo}</li>)}</ul>
      </section>
    </main>
  );
}
