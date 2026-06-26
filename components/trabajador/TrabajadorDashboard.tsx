'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useAuth';
import { useActualizarEstadoAgua } from '@/hooks/useResidente';
import { trpcReact } from '@/lib/trpc-react';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Scissors, RotateCcw, Droplets, AlertTriangle, Home } from 'lucide-react';

export function TrabajadorDashboard() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [tab, setTab]             = useState<'cortes' | 'reconexiones'>('cortes');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const pendientesCorteQuery      = trpcReact.cortes.pendientesDeCorte.useQuery();
  const pendientesReconexionQuery = trpcReact.cortes.pendientesDeReconexion.useQuery();
  const { confirmarCorte, confirmarReconexion } = useActualizarEstadoAgua();

  const cargando          = sessionPending || pendientesCorteQuery.isLoading || pendientesReconexionQuery.isLoading;
  const pendientesCorte    = pendientesCorteQuery.data ?? [];
  const pendientesReconexion = pendientesReconexionQuery.data ?? [];

  async function handleConfirmarCorte(perfilId: string) {
    setProcesando(perfilId);
    setError(null);
    try {
      await confirmarCorte({ perfilId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al confirmar corte');
    } finally {
      setProcesando(null);
    }
  }

  async function handleConfirmarReconexion(perfilId: string) {
    setProcesando(perfilId);
    setError(null);
    try {
      await confirmarReconexion({ perfilId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al confirmar reconexión');
    } finally {
      setProcesando(null);
    }
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">

        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Cuadrilla de Cortes</h1>
              <p className="mt-2 text-sky-100">{session?.user?.name}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push('/residente')} className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0">
                <Home className="mr-2 h-4 w-4" />Inicio
              </Button>
              <Button variant="secondary" onClick={salir}><LogOut className="mr-2 h-4 w-4" />Salir</Button>
            </div>
          </div>
        </div>

        {error && <div role="alert" aria-live="polite" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">{error}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Pendientes de corte</p><p className="text-3xl font-bold text-red-600">{pendientesCorte.length}</p></div><Scissors className="h-8 w-8 text-red-600" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Pendientes de reconexión</p><p className="text-3xl font-bold text-amber-600">{pendientesReconexion.length}</p></div><RotateCcw className="h-8 w-8 text-amber-600" /></CardContent></Card>
        </div>

        <div className="flex gap-2">
          <Button variant={tab === 'cortes' ? 'default' : 'outline'} onClick={() => setTab('cortes')}>Cortes pendientes ({pendientesCorte.length})</Button>
          <Button variant={tab === 'reconexiones' ? 'default' : 'outline'} onClick={() => setTab('reconexiones')}>Reconexiones pendientes ({pendientesReconexion.length})</Button>
        </div>

        {tab === 'cortes' && (
          <Card>
            <CardHeader>
              <CardTitle>Residentes que deben ser cortados</CardTitle>
              <p className="text-sm text-muted-foreground">La cuadrilla debe ir a cortar físicamente el servicio</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendientesCorte.length === 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center"><Droplets className="mx-auto mb-3 h-10 w-10 text-green-600" /><p className="font-medium text-green-700">Sin cortes pendientes</p></div>
              )}
              {pendientesCorte.map(c => (
                <div key={c.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-red-100 p-3"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
                    <div>
                      <p className="font-medium">{c.usuario?.name}</p>
                      <p className="text-sm text-muted-foreground">{c.circuito?.nombre} · {c.edificio} · {c.departamento}</p>
                      <p className="text-sm text-red-600">Falta de pago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <EstadoAguaBadge estado="pendiente_corte" />
                    <Button disabled={procesando === c.id} onClick={() => handleConfirmarCorte(c.id)}>
                      {procesando === c.id ? 'Procesando...' : 'Confirmar corte'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {tab === 'reconexiones' && (
          <Card>
            <CardHeader>
              <CardTitle>Residentes que deben ser reconectados</CardTitle>
              <p className="text-sm text-muted-foreground">Ya pagaron, la cuadrilla debe ir a reconectar el servicio</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendientesReconexion.length === 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center"><Droplets className="mx-auto mb-3 h-10 w-10 text-green-600" /><p className="font-medium text-green-700">Sin reconexiones pendientes</p></div>
              )}
              {pendientesReconexion.map(c => (
                <div key={c.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-100 p-3"><RotateCcw className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="font-medium">{c.usuario?.name}</p>
                      <p className="text-sm text-muted-foreground">{c.circuito?.nombre} · {c.edificio} · {c.departamento}</p>
                      <p className="text-sm text-amber-600">Pagó reconexión — pendiente de reconexión física</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <EstadoAguaBadge estado="pendiente_reconexion" />
                    <Button disabled={procesando === c.id} onClick={() => handleConfirmarReconexion(c.id)} className="bg-green-600 hover:bg-green-700">
                      {procesando === c.id ? 'Procesando...' : 'Confirmar reconexión'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
