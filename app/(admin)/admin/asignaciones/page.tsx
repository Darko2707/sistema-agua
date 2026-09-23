'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldCheck, UserMinus, Users } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

type RolOperativo = 'cuadrilla_cortes' | 'operador_pozo';

const nombreRol: Record<RolOperativo, string> = {
  cuadrilla_cortes: 'Cuadrilla de cortes',
  operador_pozo: 'Operador de pozo',
};

export default function AsignacionesPage() {
  const router = useRouter();
  const utils = trpcReact.useUtils();
  const [fraccionamientoId, setFraccionamientoId] = useState('');
  const [circuitoId, setCircuitoId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [rol, setRol] = useState<RolOperativo>('cuadrilla_cortes');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const tenantsQuery = trpcReact.fraccionamientos.listar.useQuery();
  const tenants = tenantsQuery.data ?? [];
  const circuitosQuery = trpcReact.circuitos.listarPorFraccionamiento.useQuery(
    { fraccionamientoId },
    { enabled: Boolean(fraccionamientoId) },
  );
  const serviciosQuery = trpcReact.servicios.listarTenant.useQuery(
    { fraccionamientoId },
    { enabled: Boolean(fraccionamientoId) },
  );
  const personalQuery = trpcReact.usuarios.listarPersonalPorCircuito.useQuery(
    { fraccionamientoId },
    { enabled: Boolean(fraccionamientoId) },
  );
  const asignacionesQuery = trpcReact.usuarios.listarPersonalPorCircuito.useQuery(
    { fraccionamientoId, circuitoId },
    { enabled: Boolean(fraccionamientoId && circuitoId) },
  );

  const asignarMutation = trpcReact.usuarios.asignarPersonalOperativo.useMutation();
  const quitarMutation = trpcReact.usuarios.quitarAsignacionPersonal.useMutation();

  const circuitos = circuitosQuery.data ?? [];
  const servicios = (serviciosQuery.data ?? []).filter((item) => item.estado === 'activo');
  const candidatos = useMemo(() => {
    const vistos = new Set<string>();
    return (personalQuery.data ?? []).filter((item) => {
      if (item.rol !== 'cuadrilla_cortes' && item.rol !== 'operador_pozo') return false;
      if (vistos.has(item.id)) return false;
      vistos.add(item.id);
      return true;
    });
  }, [personalQuery.data]);
  const asignaciones = (asignacionesQuery.data ?? []).filter((item) => item.asignacionId);

  function cambiarFraccionamiento(value: string) {
    setFraccionamientoId(value);
    setCircuitoId('');
    setServicioId('');
    setUsuarioId('');
    setMensaje(null);
  }

  function cambiarCircuito(value: string) {
    setCircuitoId(value);
    setMensaje(null);
  }

  async function asignar() {
    setMensaje(null);
    const usuario = candidatos.find((item) => item.id === usuarioId);
    const rolSeleccionado = usuario?.rol === 'cuadrilla_cortes' || usuario?.rol === 'operador_pozo'
      ? usuario.rol
      : rol;
    if (!fraccionamientoId || !circuitoId || !servicioId || !usuarioId) {
      setMensaje('Selecciona fraccionamiento, circuito, servicio y personal.');
      return;
    }
    try {
      await asignarMutation.mutateAsync({
        fraccionamientoId,
        circuitoId,
        fraccionamientoServicioId: servicioId,
        usuarioId,
        rol: rolSeleccionado,
      });
      await asignacionesQuery.refetch();
      setUsuarioId('');
      setMensaje('Asignación guardada correctamente.');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar la asignación.');
    }
  }

  async function quitar(asignacionId: string) {
    setMensaje(null);
    try {
      await quitarMutation.mutateAsync({ asignacionId });
      await asignacionesQuery.refetch();
      setMensaje('Asignación retirada.');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo retirar la asignación.');
    }
  }

  const cargando = tenantsQuery.isLoading;
  if (cargando) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8" />
              <div>
                <h1 className="text-3xl font-bold">Personal operativo</h1>
                <p className="mt-1 text-indigo-100">Asignaciones por fraccionamiento, circuito y servicio</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin')} className="bg-white/10 text-white hover:bg-white/20 border-none">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver
            </Button>
          </div>
        </div>

        {mensaje && <div role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-700 shadow-sm">{mensaje}</div>}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Nueva asignación</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-5 md:items-end">
            <div className="space-y-2"><Label htmlFor="tenant">Fraccionamiento</Label><select id="tenant" value={fraccionamientoId} onChange={(event) => cambiarFraccionamiento(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecciona...</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="circuito">Circuito</Label><select id="circuito" value={circuitoId} onChange={(event) => cambiarCircuito(event.target.value)} disabled={!fraccionamientoId} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecciona...</option>{circuitos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="servicio">Servicio</Label><select id="servicio" value={servicioId} onChange={(event) => setServicioId(event.target.value)} disabled={!fraccionamientoId} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecciona...</option>{servicios.map((item) => <option key={item.id} value={item.id}>{item.nombre} ({item.clave})</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="rol">Rol</Label><select id="rol" value={rol} onChange={(event) => setRol(event.target.value as RolOperativo)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="cuadrilla_cortes">Cuadrilla de cortes</option><option value="operador_pozo">Operador de pozo</option></select></div>
            <div className="space-y-2 md:col-span-2 md:col-start-1"><Label htmlFor="usuario">Personal</Label><select id="usuario" value={usuarioId} onChange={(event) => setUsuarioId(event.target.value)} disabled={!fraccionamientoId} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">Selecciona...</option>{candidatos.filter((item) => item.rol === rol).map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.email}</option>)}</select></div>
            <Button onClick={asignar} disabled={asignarMutation.isPending || !fraccionamientoId || !circuitoId || !servicioId || !usuarioId} className="md:col-span-2">{asignarMutation.isPending ? 'Guardando...' : 'Asignar personal'}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asignaciones activas del circuito</CardTitle></CardHeader>
          <CardContent>
            {!circuitoId && <p className="text-sm text-muted-foreground">Selecciona un circuito para consultar sus asignaciones.</p>}
            {circuitoId && asignaciones.length === 0 && <p className="text-sm text-muted-foreground">No hay personal operativo asignado.</p>}
            <div className="space-y-3">{asignaciones.map((item) => <div key={item.asignacionId} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.nombre}</p><p className="text-sm text-muted-foreground">{item.email}</p><div className="mt-2 flex gap-2"><Badge>{item.rol === 'cuadrilla_cortes' || item.rol === 'operador_pozo' ? nombreRol[item.rol] : item.rol}</Badge><Badge variant="outline">Servicio asignado</Badge></div></div><Button variant="outline" size="sm" onClick={() => item.asignacionId && quitar(item.asignacionId)} disabled={quitarMutation.isPending || !item.asignacionId}><UserMinus className="mr-2 h-4 w-4" />Retirar</Button></div>)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
