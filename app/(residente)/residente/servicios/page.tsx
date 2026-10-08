'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Info, Loader2, Plus, RefreshCw, X } from 'lucide-react';

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
    <div className="min-h-screen bg-[#f4eee0] text-[#3a3528] md:bg-[#e8e2d2] md:px-4 md:py-12">
      <div className="mx-auto max-w-[460px] space-y-4 pb-12 md:rounded-[32px] md:bg-[#f4eee0] md:px-4 md:py-5 md:shadow-[0_24px_64px_rgba(120,90,30,.16)]">
        <div className="rounded-b-[36px] bg-[#fbf6eb] px-5 pb-6 pt-5 md:rounded-[28px]">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.push('/residente')} aria-label="Volver al inicio" className="h-10 w-10 shrink-0 rounded-full border-[#efe3cc] bg-white text-[#15623a] shadow-sm hover:bg-[#f8f1e3]">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div><h1 className="font-[family-name:var(--font-bricolage)] text-2xl font-bold text-[#15493a]">Mis servicios</h1><p className="mt-0.5 text-sm text-[#9a8e72]">Servicios y cargos de tu fraccionamiento</p></div>
          </div>
        </div>

        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

        <Card className="rounded-[22px] border-[#f2ead8] bg-white shadow-[0_6px_18px_rgba(120,90,30,.07)]"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg text-[#15493a]">Servicios contratados</CardTitle><Button variant="outline" size="sm" onClick={actualizar} disabled={busy} className="border-[#efe3cc] text-[#15623a]"><RefreshCw className="mr-2 h-4 w-4" /> Actualizar</Button></CardHeader><CardContent className="space-y-3">
          {(misServicios.data ?? []).map(service => <div key={service.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{service.nombre}</p><p className="text-sm text-muted-foreground">${service.montoMensual} mensuales</p></div><div className="flex items-center gap-2"><Badge variant={service.activo ? 'default' : 'secondary'}>{service.activo ? 'Activo' : 'Cancelado'}</Badge>{service.clave !== 'agua' && <Button variant="outline" size="sm" disabled={busy} onClick={() => cambiarSuscripcion(service.fraccionamientoServicioId, !service.activo)}>{service.activo ? <><X className="mr-1 h-4 w-4" /> Cancelar</> : <><Plus className="mr-1 h-4 w-4" /> Suscribirme</>}</Button>}</div></div>)}
          {(misServicios.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Todavía no tienes servicios contratados.</p>}
        </CardContent></Card>

        <Card className="rounded-[22px] border-[#f2ead8] bg-white shadow-[0_6px_18px_rgba(120,90,30,.07)]"><CardHeader><CardTitle className="text-lg text-[#15493a]">Servicios disponibles</CardTitle></CardHeader><CardContent className="space-y-3">
          {(disponibles.data ?? []).filter(service => service.clave !== 'agua' && !idsActivos.has(service.id)).map(service => <div key={service.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{service.nombre}</p><p className="text-sm text-muted-foreground">${service.montoMensual} mensuales</p></div><Button size="sm" disabled={busy} onClick={() => cambiarSuscripcion(service.id, true)}><Plus className="mr-1 h-4 w-4" /> Suscribirme</Button></div>)}
          {(disponibles.data ?? []).filter(service => service.clave !== 'agua' && !idsActivos.has(service.id)).length === 0 && <p className="text-sm text-muted-foreground">No hay servicios adicionales disponibles.</p>}
        </CardContent></Card>

        <Card className="rounded-[22px] border-[#f2ead8] bg-white shadow-[0_6px_18px_rgba(120,90,30,.07)]"><CardHeader className="space-y-2"><CardTitle className="text-lg text-[#15493a]">Cargos pendientes</CardTitle><p className="flex gap-2 text-sm font-normal leading-5 text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#9a8e72]" />Son mensualidades de servicios adicionales que ya se generaron y aún no has pagado. No incluyen tu recibo regular de agua.</p></CardHeader><CardContent className="space-y-3">
          {cargosPendientes.map(cargo => <div key={cargo.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{cargo.nombreServicio}</p><p className="text-sm text-muted-foreground">Periodo {cargo.mes}/{cargo.anio} · ${cargo.monto} MXN</p></div><Button size="sm" onClick={() => pagar(cargo.id)} disabled={cargandoPago !== null}>{cargandoPago === cargo.id ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Redirigiendo...</> : <><CreditCard className="mr-1 h-4 w-4" /> Pagar</>}</Button></div>)}
          {cargosPendientes.length === 0 && <p className="text-sm text-muted-foreground">No tienes cargos pendientes de servicios adicionales.</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}
