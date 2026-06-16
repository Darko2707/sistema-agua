'use client';

import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  LogOut,
  Scissors,
  RotateCcw,
  Droplets,
  AlertTriangle,
  Home,
} from 'lucide-react';

type ResidentePendiente = {
  id: string;
  edificio: string;
  departamento: string;
  estadoAgua: string;
  usuario: {
    name: string;
  };
  circuito: {
    nombre: string;
  };
};

function trpcQueryUrl(path: string) {
  return `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ '0': { json: undefined } }));
}

export default function TrabajadorPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [pendientesCorte, setPendientesCorte] = useState<ResidentePendiente[]>([]);
  const [pendientesReconexion, setPendientesReconexion] = useState<ResidentePendiente[]>([]);
  const [reconectados, setReconectados] = useState<ResidentePendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cortes' | 'reconexiones'>('cortes');

  async function cargarDatos() {
    const [resPendientesCorte, resPendientesReconexion, resReconectados] = await Promise.all([
      fetch(trpcQueryUrl('cortes.pendientesDeCorte')),
      fetch(trpcQueryUrl('cortes.pendientesDeReconexion')),
      fetch(trpcQueryUrl('cortes.listarCortados')),
    ]);

    if (resPendientesCorte.ok) {
      const json = await resPendientesCorte.json();
      setPendientesCorte(json?.[0]?.result?.data ?? []);
    }

    if (resPendientesReconexion.ok) {
      const json = await resPendientesReconexion.json();
      setPendientesReconexion(json?.[0]?.result?.data ?? []);
    }

    if (resReconectados.ok) {
      const json = await resReconectados.json();
      setReconectados(json?.[0]?.result?.data ?? []);
    }

    setCargando(false);
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  // ✅ CORREGIDO: llamada directa sin batch
  async function handleConfirmarCorte(perfilId: string) {
    setProcesando(perfilId);
    setError(null);

    try {
      const res = await fetch('/api/trpc/cortes.confirmarCorte', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ perfilId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.json?.message || 'Error al confirmar corte');
      }

      await cargarDatos();
    } catch (err: any) {
      setError(err.message);
      console.error('Error:', err);
    }

    setProcesando(null);
  }

  // ✅ CORREGIDO: llamada directa sin batch
  async function handleConfirmarReconexion(perfilId: string) {
    setProcesando(perfilId);
    setError(null);

    try {
      const res = await fetch('/api/trpc/cortes.confirmarReconexion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ perfilId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.json?.message || 'Error al confirmar reconexión');
      }

      await cargarDatos();
    } catch (err: any) {
      setError(err.message);
      console.error('Error:', err);
    }

    setProcesando(null);
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  function irAResidente() {
    router.push('/residente');
  }

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Cuadrilla de Cortes</h1>
              <p className="mt-2 text-sky-100">{session?.user?.name}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={irAResidente}
                className="bg-white/20 text-white hover:bg-white/30"
              >
                <Home className="mr-2 h-4 w-4" />
                Mi cuenta
              </Button>
              <Button variant="secondary" onClick={salir}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>

        {/* Error global */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Pendientes de corte</p>
                <p className="text-3xl font-bold text-red-600">{pendientesCorte.length}</p>
              </div>
              <Scissors className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Pendientes de reconexión</p>
                <p className="text-3xl font-bold text-amber-600">{pendientesReconexion.length}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-amber-600" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            variant={tab === 'cortes' ? 'default' : 'outline'}
            onClick={() => setTab('cortes')}
          >
            Cortes pendientes ({pendientesCorte.length})
          </Button>
          <Button
            variant={tab === 'reconexiones' ? 'default' : 'outline'}
            onClick={() => setTab('reconexiones')}
          >
            Reconexiones pendientes ({pendientesReconexion.length})
          </Button>
        </div>

        {/* Pendientes de Corte */}
        {tab === 'cortes' && (
          <Card>
            <CardHeader>
              <CardTitle>Residentes que deben ser cortados</CardTitle>
              <p className="text-sm text-muted-foreground">
                La cuadrilla debe ir a cortar físicamente el servicio
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendientesCorte.length === 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                  <Droplets className="mx-auto mb-3 h-10 w-10 text-green-600" />
                  <p className="font-medium text-green-700">Sin cortes pendientes</p>
                </div>
              )}

              {pendientesCorte.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-red-100 p-3">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium">{c.usuario.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.circuito.nombre} · {c.edificio} · {c.departamento}
                      </p>
                      <p className="text-sm text-red-600">Falta de pago</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="destructive">Pendiente de corte</Badge>
                    <Button
                      variant="default"
                      disabled={procesando === c.id}
                      onClick={() => handleConfirmarCorte(c.id)}
                    >
                      {procesando === c.id ? 'Procesando...' : 'Confirmar corte'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Pendientes de Reconexión */}
        {tab === 'reconexiones' && (
          <Card>
            <CardHeader>
              <CardTitle>Residentes que deben ser reconectados</CardTitle>
              <p className="text-sm text-muted-foreground">
                Ya pagaron, la cuadrilla debe ir a reconectar el servicio
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendientesReconexion.length === 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                  <Droplets className="mx-auto mb-3 h-10 w-10 text-green-600" />
                  <p className="font-medium text-green-700">Sin reconexiones pendientes</p>
                </div>
              )}

              {pendientesReconexion.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-100 p-3">
                      <RotateCcw className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium">{c.usuario.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.circuito.nombre} · {c.edificio} · {c.departamento}
                      </p>
                      <p className="text-sm text-amber-600">Pagó reconexión - pendiente de reconexión física</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="border-amber-300 text-amber-600">
                      Pendiente reconexión
                    </Badge>
                    <Button
                      variant="default"
                      disabled={procesando === c.id}
                      onClick={() => handleConfirmarReconexion(c.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {procesando === c.id ? 'Procesando...' : 'Confirmar reconexión'}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Reconectados hoy */}
        {reconectados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Reconectados hoy</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cortes completados exitosamente
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {reconectados.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{c.usuario.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.circuito.nombre} · {c.edificio} · {c.departamento}
                    </p>
                  </div>
                  <Badge variant="default" className="bg-green-600">Reconectado</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}