'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Gift, Loader2, Plus, Trash2 } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Period = { mes: number; anio: number };
const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function periodKey(period: Period) { return `${period.anio}-${period.mes}`; }

export default function DonativosAdminPage() {
  const router = useRouter();
  const tenantsQuery = trpcReact.fraccionamientos.listar.useQuery();
  const tenants = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('');
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [periods, setPeriods] = useState<Period[]>([{ mes: now.getMonth() + 1, anio: now.getFullYear() }]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const parsedAmount = Number(amount);
  const request = useMemo(() => ({
    fraccionamientoId: tenantId || tenants[0]?.id || '',
    monto: parsedAmount,
    periodos: periods,
  }), [tenantId, tenants, parsedAmount, periods]);

  const previewQuery = trpcReact.donativos.previsualizar.useQuery(request, {
    enabled: Boolean(request.fraccionamientoId && parsedAmount > 0 && periods.length > 0),
    retry: false,
  });
  const createMutation = trpcReact.donativos.generar.useMutation();
  const preview = previewQuery.data;
  const tenantSelected = tenantId || tenants[0]?.id || '';
  const busy = createMutation.isPending;

  function addPeriod() {
    setError(null);
    const candidate = { mes: Number(month), anio: Number(year) };
    if (!Number.isInteger(candidate.mes) || candidate.mes < 1 || candidate.mes > 12 || !Number.isInteger(candidate.anio) || candidate.anio < 2020 || candidate.anio > 2100) {
      setError('Indica un mes y año válidos.');
      return;
    }
    if (periods.some(period => periodKey(period) === periodKey(candidate))) {
      setError('Ese periodo ya está seleccionado.');
      return;
    }
    setPeriods(current => [...current, candidate].sort((a, b) => a.anio - b.anio || a.mes - b.mes));
  }

  async function generate() {
    setError(null);
    setNotice(null);
    if (!tenantSelected || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) >= 1e-7) {
      setError('Selecciona un fraccionamiento e indica un importe positivo con hasta dos decimales.');
      return;
    }
    if (!preview || preview.viviendas.length === 0) {
      setError('La vista previa debe mostrar al menos una vivienda elegible.');
      return;
    }
    try {
      const result = await createMutation.mutateAsync({ ...request, fraccionamientoId: tenantSelected });
      setNotice(`Se generaron ${result.generados} cargos para ${result.viviendas} viviendas. Total: $${result.importeTotal} MXN.`);
      await previewQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron generar los donativos.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-emerald-800 p-6 text-white shadow-lg">
          <div className="flex items-center gap-3"><Gift className="h-8 w-8" /><div><h1 className="text-3xl font-bold">Donativos</h1><p className="mt-1 text-emerald-100">Crea cargos para las viviendas de un fraccionamiento y periodos específicos.</p></div></div>
          <Button variant="secondary" onClick={() => router.push('/admin')}><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
        </header>

        {(error || notice || previewQuery.error) && <div role="alert" className={`rounded-xl border p-4 ${error || previewQuery.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{error ?? previewQuery.error?.message ?? notice}</div>}

        <Card>
          <CardHeader><CardTitle>Configurar donativo</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="donativo-tenant">Fraccionamiento / circuito</Label><select id="donativo-tenant" value={tenantSelected} onChange={event => setTenantId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">{tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.nombre}</option>)}</select><p className="text-xs text-muted-foreground">En el modelo actual cada circuito migrado corresponde a un fraccionamiento.</p></div>
            <div className="space-y-2"><Label htmlFor="donativo-monto">Importe por vivienda y mes (MXN)</Label><Input id="donativo-monto" type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Ej. 100.00" /></div>

            <div className="space-y-2 md:col-span-2"><Label>Periodos mensuales</Label><div className="flex flex-wrap gap-2">{periods.map(period => <div key={periodKey(period)} className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm"><span>{meses[period.mes - 1]} {period.anio}</span><button type="button" aria-label={`Quitar ${meses[period.mes - 1]} ${period.anio}`} onClick={() => setPeriods(current => current.filter(item => periodKey(item) !== periodKey(period)))} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
              <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="donativo-mes">Mes</Label><select id="donativo-mes" value={month} onChange={event => setMonth(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">{meses.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></div><div className="space-y-1"><Label htmlFor="donativo-anio">Año</Label><Input id="donativo-anio" type="number" min="2020" max="2100" value={year} onChange={event => setYear(event.target.value)} className="w-28" /></div><Button type="button" variant="outline" onClick={addPeriod}><Plus className="mr-2 h-4 w-4" /> Agregar periodo</Button></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vista previa de viviendas elegibles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {previewQuery.isFetching && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Actualizando vista previa…</p>}
            {preview && <>
              <div className="grid gap-3 rounded-xl bg-emerald-50 p-4 sm:grid-cols-3"><p><span className="block text-sm text-muted-foreground">Fraccionamiento</span><strong>{preview.fraccionamiento}</strong></p><p><span className="block text-sm text-muted-foreground">Cargos</span><strong>{preview.totalCargos}</strong></p><p><span className="block text-sm text-muted-foreground">Importe total</span><strong>${preview.importeTotal} MXN</strong></p></div>
              {preview.duplicados > 0 && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Hay {preview.duplicados} cargos que ya existen para las viviendas y periodos seleccionados. No se generará el lote para evitar duplicados.</p>}
              <div className="max-h-96 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">Residente</th><th className="p-3">Edificio</th><th className="p-3">Vivienda</th><th className="p-3">Periodos</th><th className="p-3">Importe</th></tr></thead><tbody>{preview.viviendas.map(home => <tr key={home.perfilId} className="border-t"><td className="p-3">{home.nombre}</td><td className="p-3">{home.edificio}</td><td className="p-3">{home.departamento}</td><td className="p-3">{periods.map(period => `${String(period.mes).padStart(2, '0')}/${period.anio}`).join(', ')}</td><td className="p-3">${(Number(amount) * periods.length).toFixed(2)}</td></tr>)}</tbody></table>{preview.viviendas.length === 0 && <p className="p-4 text-sm text-muted-foreground">No hay viviendas elegibles en este fraccionamiento.</p>}</div>
            </>}
            {!preview && !previewQuery.isFetching && <p className="text-sm text-muted-foreground">Selecciona un fraccionamiento, importe y periodo para calcular la vista previa.</p>}
            <Button onClick={generate} disabled={busy || !preview || preview.duplicados > 0 || preview.viviendas.length === 0 || previewQuery.isFetching} className="w-full sm:w-auto">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando cargos…</> : 'Confirmar y generar donativos'}</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
