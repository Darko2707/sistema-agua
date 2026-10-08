'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CheckCircle2, KeyRound, Loader2, Plus, Power, Save, Trash2, TriangleAlert, X } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FraccionamientosAdminPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
    const [montoMensual, setMontoMensual] = useState('50');
    const [montoReconexion, setMontoReconexion] = useState('300');
    const [diaCorte, setDiaCorte] = useState('5');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState<{ id: string; nombre: string } | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null);

  const fraccionamientosQuery = trpcReact.fraccionamientos.listar.useQuery();
  const crearMutation = trpcReact.fraccionamientos.crear.useMutation();
  const mercadoPagoMutation = trpcReact.fraccionamientos.actualizarMercadoPago.useMutation();
  const cambiarEstadoMutation = trpcReact.fraccionamientos.cambiarEstado.useMutation();
  const eliminarMutation = trpcReact.fraccionamientos.eliminar.useMutation();

  async function crearFraccionamiento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMensaje(null);

    const nombreNormalizado = nombre.trim();
    if (nombreNormalizado.length < 2) {
      setError('Escribe un nombre de al menos 2 caracteres');
      return;
    }

    try {
      const creado = await crearMutation.mutateAsync({
        nombre: nombreNormalizado,
        montoMensual: Number(montoMensual),
        montoReconexion: Number(montoReconexion),
        diaCorte: Number(diaCorte),
      });
      setNombre('');
      setMensaje(`Fraccionamiento “${creado.nombre}” creado correctamente`);
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el fraccionamiento');
    }
  }

  async function guardarMercadoPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configurando) return;
    setErrorConfiguracion(null);
    try {
      await mercadoPagoMutation.mutateAsync({
        fraccionamientoId: configurando.id,
        collectorId: collectorId.trim(),
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      });
      setMensaje('Mercado Pago configurado correctamente');
      setConfigurando(null);
      setAccessToken('');
      setCollectorId('');
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setErrorConfiguracion(cause instanceof Error ? cause.message : 'No se pudo guardar Mercado Pago');
    }
  }

  async function cambiarEstado(fraccionamiento: { id: string; nombre: string; activo: boolean }) {
    const accion = fraccionamiento.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Deseas ${accion} “${fraccionamiento.nombre}”?${fraccionamiento.activo ? ' Sus usuarios no podrán ingresar, pagar ni crear cuentas.' : ''}`)) return;
    setError(null);
    setMensaje(null);
    try {
      await cambiarEstadoMutation.mutateAsync({ fraccionamientoId: fraccionamiento.id, activo: !fraccionamiento.activo });
      setMensaje(`Fraccionamiento ${fraccionamiento.activo ? 'desactivado' : 'activado'} correctamente`);
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el fraccionamiento');
    }
  }

  async function eliminarFraccionamiento(fraccionamiento: { id: string; nombre: string }) {
    if (!window.confirm(`¿Eliminar permanentemente “${fraccionamiento.nombre}”? Esta acción no se puede deshacer.`)) return;
    setError(null);
    setMensaje(null);
    try {
      await eliminarMutation.mutateAsync({ fraccionamientoId: fraccionamiento.id });
      setMensaje('Fraccionamiento eliminado correctamente');
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el fraccionamiento');
    }
  }

  const fraccionamientos = fraccionamientosQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8" />
              <div>
                <h1 className="text-3xl font-bold">Fraccionamientos</h1>
                <p className="mt-1 text-sky-100">Alta de nuevos tenants y consulta del catálogo activo</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/admin')}
              className="border-none bg-white/10 text-white hover:bg-white/20"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>

        {(error || mensaje) && (
          <div
            role="alert"
            className={`flex items-center gap-2 rounded-2xl border p-4 ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            {error ? <TriangleAlert className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <span>{error ?? mensaje}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Crear nuevo fraccionamiento</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5 md:items-end" onSubmit={crearFraccionamiento}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="nombre-fraccionamiento">Nombre</Label>
                <Input
                  id="nombre-fraccionamiento"
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  placeholder="Fraccionamiento Las Palmas"
                  maxLength={160}
                  autoComplete="organization"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monto-mensual">Monto mensual</Label>
                <Input id="monto-mensual" type="number" min="0" step="0.01" value={montoMensual} onChange={(event) => setMontoMensual(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monto-reconexion">Monto de reconexión</Label>
                <Input id="monto-reconexion" type="number" min="0" step="0.01" value={montoReconexion} onChange={(event) => setMontoReconexion(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dia-corte">Día de corte</Label>
                <Input id="dia-corte" type="number" min="1" max="28" step="1" value={diaCorte} onChange={(event) => setDiaCorte(event.target.value)} required />
              </div>
              <Button type="submit" disabled={crearMutation.isPending}>
                {crearMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Crear fraccionamiento
              </Button>
            </form>
            <p className="mt-3 text-sm text-muted-foreground">
              Después de crearlo deberás configurar su suscripción anual y sus servicios.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fraccionamientos</CardTitle>
          </CardHeader>
          <CardContent>
            {fraccionamientosQuery.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : fraccionamientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fraccionamientos registrados.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {fraccionamientos.map((fraccionamiento) => (
                  <div key={fraccionamiento.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{fraccionamiento.nombre}</p>
                      <p className="text-sm text-muted-foreground">/{fraccionamiento.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${fraccionamiento.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                        {fraccionamiento.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        fraccionamiento.mercadoPagoConfigurado
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        Mercado Pago: {fraccionamiento.mercadoPagoConfigurado ? 'configurado' : 'pendiente'}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!fraccionamiento.activo}
                        onClick={() => {
                          setConfigurando({ id: fraccionamiento.id, nombre: fraccionamiento.nombre });
                          setAccessToken('');
                          setCollectorId('');
                          setErrorConfiguracion(null);
                        }}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />Configurar pago
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cambiarEstadoMutation.isPending || eliminarMutation.isPending}
                        onClick={() => cambiarEstado(fraccionamiento)}
                      >
                        <Power className="mr-2 h-4 w-4" />{fraccionamiento.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={cambiarEstadoMutation.isPending || eliminarMutation.isPending}
                        onClick={() => eliminarFraccionamiento(fraccionamiento)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {configurando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mercado-pago-title"
            onSubmit={guardarMercadoPago}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="mercado-pago-title" className="text-lg font-semibold">Mercado Pago</h2>
                <p className="mt-1 text-sm text-muted-foreground">{configurando.nombre}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Cerrar" onClick={() => setConfigurando(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              La configuración pertenece al fraccionamiento. El token se cifra y no volverá a mostrarse.
            </p>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mp-access-token">Access Token</Label>
                <Input id="mp-access-token" type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="APP_USR-..." autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">Déjalo vacío para conservar el token ya configurado.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-collector-id">Collector ID</Label>
                <Input id="mp-collector-id" inputMode="numeric" pattern="[0-9]+" value={collectorId} onChange={(event) => setCollectorId(event.target.value)} placeholder="123456789" required />
              </div>
              {errorConfiguracion && <p role="alert" className="text-sm text-red-700">{errorConfiguracion}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfigurando(null)}>Cancelar</Button>
              <Button type="submit" disabled={mercadoPagoMutation.isPending}>
                {mercadoPagoMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
