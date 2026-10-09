'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Info, RefreshCw } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ServiciosResidentePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const misServicios = trpcReact.servicios.misServicios.useQuery();
  const misCargos = trpcReact.servicios.misCargos.useQuery();

  async function actualizar() {
    setError(null);
    try {
      await Promise.all([misServicios.refetch(), misCargos.refetch()]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la información');
    }
  }

  const cargosPendientes = (misCargos.data ?? []).filter((cargo) => cargo.estado === 'pendiente');
  const busy = misServicios.isFetching || misCargos.isFetching;

  return (
    <div className="min-h-screen bg-[#f4eee0] text-[#3a3528] md:bg-[#e8e2d2] md:px-4 md:py-12">
      <div className="mx-auto max-w-[460px] space-y-4 pb-12 md:rounded-[32px] md:bg-[#f4eee0] md:px-4 md:py-5 md:shadow-[0_24px_64px_rgba(120,90,30,.16)]">
        <div className="rounded-b-[36px] bg-[#fbf6eb] px-5 pb-6 pt-5 md:rounded-[28px]">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.push('/residente')} aria-label="Volver al inicio" className="h-10 w-10 shrink-0 rounded-full border-[#efe3cc] bg-white text-[#15623a] shadow-sm hover:bg-[#f8f1e3]">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-[family-name:var(--font-bricolage)] text-2xl font-bold text-[#15493a]">Mis servicios</h1>
              <p className="mt-0.5 text-sm text-[#9a8e72]">Servicios obligatorios de tu fraccionamiento</p>
            </div>
          </div>
        </div>

        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

        <Card className="rounded-[22px] border-[#f2ead8] bg-white shadow-[0_6px_18px_rgba(120,90,30,.07)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-[#15493a]">Servicios asignados</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">El administrador los configura para todo el fraccionamiento.</p>
            </div>
            <Button variant="outline" size="sm" onClick={actualizar} disabled={busy} className="shrink-0 border-[#efe3cc] text-[#15623a]">
              <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(misServicios.data ?? []).map((service) => (
              <div key={service.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#efe3cc] p-4">
                <div>
                  <p className="font-semibold">{service.nombre}</p>
                  <p className="text-sm text-muted-foreground">${service.montoMensual} mensuales</p>
                </div>
                <span className="rounded-full bg-[#15493a] px-3 py-1 text-xs font-semibold text-white">Obligatorio</span>
              </div>
            ))}
            {(misServicios.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">El administrador aún no ha configurado servicios para tu fraccionamiento.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-[22px] border-[#f2ead8] bg-white shadow-[0_6px_18px_rgba(120,90,30,.07)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-[#15493a]">Cargos pendientes</CardTitle>
            <p className="flex gap-2 text-sm font-normal leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#9a8e72]" />
              Son cargos obligatorios configurados para tu fraccionamiento. Puedes pagarlos junto con el agua desde el inicio.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {cargosPendientes.map((cargo) => (
              <div key={cargo.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <p className="font-semibold">{cargo.nombreServicio}</p>
                <p className="text-sm text-muted-foreground">Periodo {cargo.mes}/{cargo.anio} · ${cargo.monto} MXN</p>
              </div>
            ))}
            {cargosPendientes.length === 0 && <p className="text-sm text-muted-foreground">No tienes cargos pendientes.</p>}
            {cargosPendientes.length > 0 && <Button className="w-full" onClick={() => router.push('/residente')}>Ir a pagar</Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
