'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw, Settings2, Wallet } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export default function ServiciosAdminPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [estado, setEstado] = useState<'activo' | 'inactivo'>('activo');
  const [montoMensual, setMontoMensual] = useState('');
  const [montoReconexion, setMontoReconexion] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const tenantsQuery = trpcReact.suscripciones.listar.useQuery();
  const catalogoQuery = trpcReact.servicios.catalogo.useQuery();
  const serviciosQuery = trpcReact.servicios.listarTenant.useQuery(
    { fraccionamientoId: tenantId || '00000000-0000-0000-0000-000000000000' },
    { enabled: Boolean(tenantId) },
  );
  const configurarMutation = trpcReact.servicios.configurar.useMutation();
  const generarMutation = trpcReact.servicios.generarCargosMes.useMutation();

  const tenants = useMemo(() => {
    const rows = tenantsQuery.data ?? [];
    return rows.filter((tenant, index, all) => all.findIndex(item => item.fraccionamientoId === tenant.fraccionamientoId) === index);
  }, [tenantsQuery.data]);

  useEffect(() => {
    if (!tenantId && tenants.length > 0) setTenantId(tenants[0].fraccionamientoId);
  }, [tenantId, tenants]);

  useEffect(() => {
    if (!servicioId && catalogoQuery.data && catalogoQuery.data.length > 0) setServicioId(catalogoQuery.data[0].id);
  }, [servicioId, catalogoQuery.data]);

  function clearFeedback() { setError(null); setMensaje(null); }

  async function configurarServicio() {
    clearFeedback();
    if (!tenantId || !servicioId) return setError('Selecciona un fraccionamiento y un servicio');
    const mensual = Number(montoMensual);
    const reconexion = Number(montoReconexion);
    if (!Number.isFinite(mensual) || mensual < 0 || !Number.isFinite(reconexion) || reconexion < 0) return setError('Los montos deben ser números mayores o iguales a cero');
    try {
      await configurarMutation.mutateAsync({ fraccionamientoId: tenantId, servicioId, estado, montoMensual: mensual, montoReconexion: reconexion });
      await serviciosQuery.refetch();
      setMensaje('Configuración guardada');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'No se pudo guardar la configuración'); }
  }

  async function generarCargos() {
    clearFeedback();
    if (!tenantId) return setError('Selecciona un fraccionamiento');
    const now = new Date();
    try {
      const result = await generarMutation.mutateAsync({ fraccionamientoId: tenantId, mes: now.getUTCMonth() + 1, anio: now.getUTCFullYear() });
      setMensaje(`Se generaron ${result.generados} cargos nuevos`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'No se pudieron generar los cargos'); }
  }

  const busy = configurarMutation.isPending || generarMutation.isPending;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><Settings2 className="h-8 w-8" /><div><h1 className="text-3xl font-bold">Servicios y cargos</h1><p className="mt-1 text-sky-100">Configura servicios por fraccionamiento y genera cargos mensuales</p></div></div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin')} className="border-none bg-white/10 text-white hover:bg-white/20"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
          </div>
        </div>

        {(error || mensaje) && <div role="alert" className={`rounded-2xl border p-4 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{error ?? mensaje}</div>}

        <Card><CardHeader><CardTitle>Fraccionamiento objetivo</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2"><Label htmlFor="tenant">Fraccionamiento</Label><select id="tenant" value={tenantId} onChange={event => setTenantId(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">{tenants.map(tenant => <option key={tenant.fraccionamientoId} value={tenant.fraccionamientoId}>{tenant.nombre}</option>)}</select></div>
          <Button onClick={generarCargos} disabled={busy || !tenantId}><Wallet className="mr-2 h-4 w-4" /> Generar cargos del mes</Button>
        </CardContent></Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card><CardHeader><CardTitle>Configurar servicio</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="servicio">Servicio</Label><select id="servicio" value={servicioId} onChange={event => setServicioId(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm">{(catalogoQuery.data ?? []).map(service => <option key={service.id} value={service.id}>{service.nombre} ({service.clave})</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="monto">Monto mensual</Label><Input id="monto" type="number" min="0" step="0.01" value={montoMensual} onChange={event => setMontoMensual(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="reconexion">Monto reconexión</Label><Input id="reconexion" type="number" min="0" step="0.01" value={montoReconexion} onChange={event => setMontoReconexion(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="estado">Estado</Label><select id="estado" value={estado} onChange={event => setEstado(event.target.value as 'activo' | 'inactivo')} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
            <Button className="w-full" onClick={configurarServicio} disabled={busy || !tenantId}><RefreshCw className="mr-2 h-4 w-4" /> Guardar configuración</Button>
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Servicios configurados</CardTitle></CardHeader><CardContent>
            {serviciosQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="space-y-3">{(serviciosQuery.data ?? []).map(service => <div key={service.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{service.nombre}</p><p className="text-sm text-muted-foreground">${service.montoMensual} mensuales · ${service.montoReconexion} reconexión</p></div><Badge variant={service.estado === 'activo' ? 'default' : 'secondary'}>{service.estado}</Badge></div>)}{(serviciosQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No hay servicios configurados.</p>}</div>}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
