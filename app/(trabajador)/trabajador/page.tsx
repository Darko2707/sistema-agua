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

type CorteActivo = {
  id: string;
  motivo: string;
  fechaCorte: string;
  perfil: {
    edificio: string;
    departamento: string;
    circuito: {
      nombre: string;
    };
    usuario: {
      name: string;
    };
  };
};

function trpcQueryUrl(path: string) {
  return (
    `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(
      JSON.stringify({
        '0': {
          json: undefined,
        },
      })
    )
  );
}

export default function TrabajadorPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [activos, setActivos] = useState<CorteActivo[]>([]);
  const [reconectados, setReconectados] = useState<CorteActivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);

  async function cargarDatos() {
    const [resActivos, resReconectados] = await Promise.all([
      fetch(trpcQueryUrl('cortes.listarActivos')),
      fetch(trpcQueryUrl('cortes.reconectadosHoy')),
    ]);

    if (resActivos.ok) {
      const json = await resActivos.json();
      setActivos(json?.[0]?.result?.data ?? []);
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

  async function handleReconectar(corteId: string) {
    setProcesando(corteId);

    await fetch('/api/trpc/cortes.confirmarReconexion?batch=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        '0': {
          json: {
            corteId,
          },
        },
      }),
    });

    await cargarDatos();
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
        <p>Cargando...</p>
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
              {/* Botón para volver al panel de residente */}
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

        {/* Estadísticas */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Cortes activos</p>
                <p className="text-3xl font-bold text-red-600">{activos.length}</p>
              </div>
              <Scissors className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Reconectados hoy</p>
                <p className="text-3xl font-bold text-green-600">{reconectados.length}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-green-600" />
            </CardContent>
          </Card>
        </div>

        {/* Pendientes */}
        <Card>
          <CardHeader>
            <CardTitle>Cortes pendientes de reconexión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activos.length === 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                <Droplets className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <p className="font-medium text-green-700">Sin cortes pendientes</p>
              </div>
            )}

            {activos.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-red-100 p-3">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium">{c.perfil.usuario.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.perfil.circuito.nombre} · {c.perfil.edificio} · {c.perfil.departamento}
                    </p>
                    <p className="text-sm text-red-600">{c.motivo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="destructive">Cortado</Badge>
                  <Button
                    variant="outline"
                    disabled={procesando === c.id}
                    onClick={() => handleReconectar(c.id)}
                  >
                    {procesando === c.id ? 'Procesando...' : 'Reconectar'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Reconectados */}
        {reconectados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Reconectados hoy</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cobrar $300 MXN de reconexión
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {reconectados.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{c.perfil.usuario.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.perfil.circuito.nombre} · {c.perfil.edificio} ·{' '}
                      {c.perfil.departamento}
                    </p>
                  </div>
                  <Badge>Reconectado</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}