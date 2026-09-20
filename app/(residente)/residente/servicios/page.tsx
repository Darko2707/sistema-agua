'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Loader2, Plus, RefreshCw, X } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ServiciosResidentePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargandoPago, setCargandoPago] = useState<string | null>(null);

  const disponibles = trpcReact.servicios.disponibles.useQuery();
  const misServicios = trpcReact.servicios.misServicios.useQuery();
  const misCargos = trpcReact.servicios.misCargos.useQuery();
  const suscribir = trpcReact.servicios.suscribirme.useMutation();
  const cancelar = trpcReact.servicios.cancelar.useMutation();

  async function actualizar() {
    await Promise.all([disponibles.refetch(), misServicios.refetch(), misCargos.refetch()]);
  }

  async function cambiarSuscripcion(fraccionamientoServicioId: string, activa: boolean) {
    setError(null);
    try {
      if (activa) await suscribir.mutateAsync({ fraccionamientoServicioId });
      else await cancelar.mutateAsync({ fraccionamientoServicioId });
      await actualizar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la suscripción');
    }
  }

  async function pagar(cargoId: string) {
    setError(null);
    setCargandoPago(cargoId);
    try {
      const response = await fetch('/api/mercadopago/servicios/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cargoId }),
      });
      const data = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !data?.url) throw new Error(data?.error ?? 'No se pudo iniciar el pago');
      window.location.assign(data.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el pago');
      setCargandoPago(null);
    }
  }

  const idsActivos = new Set((misServicios.data ?? []).filter(service => service.activo).map(service => service.fraccionamientoServicioId));
  const cargosPendientes = (misCargos.data ?? []).filter(cargo => cargo.estado === 'pendiente');
  const busy = suscribir.isPending || cancelar.isPending;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div><h1 className="text-3xl font-bold">Mis servicios</h1><p className="mt-1 text-sky-100">Servicios adicionales y cargos de tu fraccionamiento</p></div>
          <Button variant="secondary" size="sm" onClick={() => router.push('/residente')} className="border-none bg-white/10 text-white hover:bg-white/20"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
        </div>

        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Servicios contratados</CardTitle><Button variant="outline" size="sm" onClick={actualizar} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" /> Actualizar</Button></CardHeader><CardContent className="space-y-3">
          {(misServicios.data ?? []).map(service => <div key={service.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{service.nombre}</p><p className="text-sm text-muted-foreground">${service.montoMensual} mensuales</p></div><div className="flex items-center gap-2"><Badge variant={service.activo ? 'default' : 'secondary'}>{service.activo ? 'Activo' : 'Cancelado'}</Badge>{service.clave !== 'agua' && <Button variant="outline" size="sm" disabled={busy} onClick={() => cambiarSuscripcion(service.fraccionamientoServicioId, !service.activo)}>{service.activo ? <><X className="mr-1 h-4 w-4" /> Cancelar</> : <><Plus className="mr-1 h-4 w-4" /> Suscribirme</>}</Button>}</div></div>)}
          {(misServicios.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Todavía no tienes servicios contratados.</p>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Servicios disponibles</CardTitle></CardHeader><CardContent className="space-y-3">
          {(disponibles.data ?? []).filter(service => service.clave !== 'agua' && !idsActivos.has(service.id)).map(service => <div key={service.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{service.nombre}</p><p className="text-sm text-muted-foreground">${service.montoMensual} mensuales</p></div><Button size="sm" disabled={busy} onClick={() => cambiarSuscripcion(service.id, true)}><Plus className="mr-1 h-4 w-4" /> Suscribirme</Button></div>)}
          {(disponibles.data ?? []).filter(service => service.clave !== 'agua' && !idsActivos.has(service.id)).length === 0 && <p className="text-sm text-muted-foreground">No hay servicios adicionales disponibles.</p>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Cargos pendientes</CardTitle></CardHeader><CardContent className="space-y-3">
          {cargosPendientes.map(cargo => <div key={cargo.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{cargo.nombreServicio}</p><p className="text-sm text-muted-foreground">Periodo {cargo.mes}/{cargo.anio} · ${cargo.monto} MXN</p></div><Button size="sm" onClick={() => pagar(cargo.id)} disabled={cargandoPago !== null}>{cargandoPago === cargo.id ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Redirigiendo...</> : <><CreditCard className="mr-1 h-4 w-4" /> Pagar</>}</Button></div>)}
          {cargosPendientes.length === 0 && <p className="text-sm text-muted-foreground">No tienes cargos pendientes.</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}
