'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { trpcReact } from '@/lib/trpc-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Edit,
  Save,
  X,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

type FormState = {
  montoMensual:     string;
  montoReconexion:  string;
  representanteId:  string;
  activo:           boolean;
};

const emptyForm: FormState = {
  montoMensual: '',
  montoReconexion: '',
  representanteId: '',
  activo: true,
};

export default function CircuitosPage() {
  const router = useRouter();
  const utils  = trpcReact.useUtils();

  const [editando,    setEditando]    = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [form,        setForm]        = useState<FormState>(emptyForm);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const circuitosQuery = trpcReact.circuitos.listar.useQuery();
  const personalQuery  = trpcReact.usuarios.listarPersonal.useQuery();

  const circuitos = circuitosQuery.data ?? [];
  const representantes = useMemo(
    () => (personalQuery.data ?? []).filter(
      (u) => u.role === 'representante' || u.role === 'admin'
    ),
    [personalQuery.data]
  );

  // Mapa id → nombre para mostrar el representante actual de cada circuito
  const nombrePorId = useMemo(() => {
    const map = new Map<string, string>();
    (personalQuery.data ?? []).forEach((u) => map.set(u.id, u.name));
    return map;
  }, [personalQuery.data]);

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const actualizarMontosMut      = trpcReact.circuitos.actualizarMontos.useMutation();
  const toggleActivoMut          = trpcReact.circuitos.toggleActivo.useMutation();
  const asignarRepresentanteMut  = trpcReact.usuarios.asignarRepresentante.useMutation();

  // ─── Edición ─────────────────────────────────────────────────────────────────
  function iniciarEdicion(c: typeof circuitos[number]) {
    setEditando(c.id);
    setForm({
      montoMensual:    c.montoMensual,
      montoReconexion: c.montoReconexion,
      representanteId: c.representanteId ?? '',
      activo:          c.activo,
    });
    setError(null);
  }

  function cancelarEdicion() {
    setEditando(null);
    setError(null);
  }

  async function guardarCambios(circuitoId: string) {
    setActualizando(true);
    setError(null);
    try {
      await actualizarMontosMut.mutateAsync({
        circuitoId,
        montoMensual:    parseFloat(form.montoMensual),
        montoReconexion: parseFloat(form.montoReconexion),
      });
      await toggleActivoMut.mutateAsync({ circuitoId, activo: form.activo });
      await asignarRepresentanteMut.mutateAsync({
        circuitoId,
        userId: form.representanteId || '',
      });
      void utils.circuitos.listar.invalidate();
      setEditando(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar los cambios del circuito');
    } finally {
      setActualizando(false);
    }
  }

  // ─── Carga ───────────────────────────────────────────────────────────────────
  if (circuitosQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8" />
              <div>
                <h1 className="text-3xl font-bold">Circuitos</h1>
                <p className="mt-1 text-sky-100">
                  Configuración de cuotas, estado y representantes por circuito
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/admin')}
              className="bg-white/10 text-white hover:bg-white/20 border-none"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600 shadow-sm">
            <AlertTriangle className="inline h-5 w-5 mr-2 align-middle" />
            <span className="align-middle">{error}</span>
          </div>
        )}

        {/* Grid de circuitos */}
        <div className="grid gap-4 md:grid-cols-2">
          {circuitos.map((c) => {
            const nombreRep = c.representanteId ? nombrePorId.get(c.representanteId) : null;

            return (
              <Card
                key={c.id}
                className={`transition-all duration-200 shadow-sm ${
                  !c.activo ? 'border-red-200 bg-red-50/40' : ''
                }`}
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      {c.nombre}
                      <Badge
                        variant={c.activo ? 'default' : 'destructive'}
                        className="text-xs font-semibold"
                      >
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {nombreRep ? (
                        <span className="font-medium text-slate-700">👤 {nombreRep}</span>
                      ) : (
                        <span className="text-slate-400 italic">Sin representante asignado</span>
                      )}
                    </p>
                  </div>
                  {editando !== c.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => iniciarEdicion(c)}
                      className="h-8"
                    >
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Editar
                    </Button>
                  )}
                </CardHeader>

                <CardContent>
                  {editando === c.id ? (
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">
                            Monto mensual (MXN)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form.montoMensual}
                            onChange={(e) => setForm({ ...form, montoMensual: e.target.value })}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">
                            Reconexión (MXN)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={form.montoReconexion}
                            onChange={(e) => setForm({ ...form, montoReconexion: e.target.value })}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-600">
                          Asignar Representante
                        </Label>
                        <select
                          value={form.representanteId}
                          onChange={(e) => setForm({ ...form, representanteId: e.target.value })}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Sin representante</option>
                          {representantes.map((rep) => (
                            <option key={rep.id} value={rep.id}>
                              {rep.name} ({rep.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-sm font-medium text-slate-700">
                          {form.activo
                            ? '🟢 Permitir acceso e ingresos'
                            : '🔴 Deshabilitar accesos temporalmente'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, activo: !form.activo })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            form.activo ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              form.activo ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => guardarCambios(c.id)}
                          disabled={actualizando}
                          className="flex-1"
                        >
                          {actualizando
                            ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            : <Save className="h-4 w-4 mr-1" />}
                          Guardar cambios
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelarEdicion}
                          disabled={actualizando}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 text-sm">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-muted-foreground">Cuota Mensual</span>
                        <span className="font-semibold text-slate-800">
                          {Number(c.montoMensual).toLocaleString('es-MX', {
                            style: 'currency',
                            currency: 'MXN',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-muted-foreground">Cuota Reconexión</span>
                        <span className="font-semibold text-slate-800">
                          {Number(c.montoReconexion).toLocaleString('es-MX', {
                            style: 'currency',
                            currency: 'MXN',
                          })}
                        </span>
                      </div>
                      {!c.activo && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-100/80 p-3 text-xs text-rose-800 font-medium">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                          <p>
                            Circuito inhabilitado por administración. El acceso al historial
                            y procesamiento de pagos para los residentes de este circuito
                            queda suspendido temporalmente.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

      </div>
    </div>
  );
}
