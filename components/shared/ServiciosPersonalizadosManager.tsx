'use client';

import { useState } from 'react';
import { Plus, Edit2, CheckCircle2, AlertTriangle, Loader2, SlidersHorizontal } from 'lucide-react';
import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'personalizado_dias';

type ServicioItem = {
  id: string;
  servicioId: string;
  clave: string;
  nombre: string;
  fraccionamientoId: string | null;
  frecuenciaTipo: string | null;
  intervaloPeriodicidad: number | null;
  diaCobro: number | null;
  conCorteFisico: boolean | null;
  estado: string;
  montoMensual: string;
  montoReconexion: string;
  activo: boolean;
};

interface Props {
  fraccionamientoId?: string;
  rol: 'admin' | 'representante';
  onUpdated?: () => void;
}

export function ServiciosPersonalizadosManager({ fraccionamientoId, rol: _rol, onUpdated }: Props) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ServicioItem | null>(null);

  // Form states
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('100');
  const [montoReconexion, setMontoReconexion] = useState('0');
  const [frecuenciaTipo, setFrecuenciaTipo] = useState<Frecuencia>('mensual');
  const [intervaloPeriodicidad, setIntervaloPeriodicidad] = useState('1');
  const [diaCobro, setDiaCobro] = useState('5');
  const [conCorteFisico, setConCorteFisico] = useState(false);
  const [estado, setEstado] = useState<'activo' | 'inactivo'>('activo');

  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; mensaje: string } | null>(null);

  const queryParams = fraccionamientoId ? { fraccionamientoId } : undefined;
  const serviciosQuery = trpcReact.servicios.listarPersonalizados.useQuery(queryParams);

  const crearMutation = trpcReact.servicios.crearServicioPersonalizado.useMutation();
  const editarMutation = trpcReact.servicios.editarServicioPersonalizado.useMutation();

  function abrirCrear() {
    setEditando(null);
    setNombre('');
    setMonto('100');
    setMontoReconexion('0');
    setFrecuenciaTipo('mensual');
    setIntervaloPeriodicidad('1');
    setDiaCobro('5');
    setConCorteFisico(false);
    setEstado('activo');
    setFeedback(null);
    setModalAbierto(true);
  }

  function abrirEditar(item: ServicioItem) {
    setEditando(item);
    setNombre(item.nombre);
    setMonto(item.montoMensual);
    setMontoReconexion(item.montoReconexion);
    setFrecuenciaTipo((item.frecuenciaTipo as Frecuencia) || 'mensual');
    setIntervaloPeriodicidad(String(item.intervaloPeriodicidad || 1));
    setDiaCobro(String(item.diaCobro || 5));
    setConCorteFisico(Boolean(item.conCorteFisico));
    setEstado((item.estado as 'activo' | 'inactivo') || 'activo');
    setFeedback(null);
    setModalAbierto(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const m = Number(monto);
    const rec = Number(montoReconexion);
    const intervalo = Number(intervaloPeriodicidad) || 1;
    const dia = Number(diaCobro) || 1;

    if (!nombre.trim()) {
      setFeedback({ tipo: 'error', mensaje: 'El nombre del servicio es obligatorio' });
      return;
    }
    if (isNaN(m) || m < 0) {
      setFeedback({ tipo: 'error', mensaje: 'El monto de tarifa debe ser mayor o igual a 0' });
      return;
    }
    if (isNaN(dia) || dia < 1 || dia > 31) {
      setFeedback({ tipo: 'error', mensaje: 'El día de cobro debe estar entre 1 y 31' });
      return;
    }

    try {
      if (editando) {
        await editarMutation.mutateAsync({
          servicioId: editando.servicioId,
          ...(fraccionamientoId ? { fraccionamientoId } : {}),
          nombre: nombre.trim(),
          monto: m,
          montoReconexion: rec,
          frecuenciaTipo,
          intervaloPeriodicidad: intervalo,
          diaCobro: dia,
          estado,
        });
        setFeedback({ tipo: 'ok', mensaje: `Servicio "${nombre}" actualizado correctamente` });
      } else {
        await crearMutation.mutateAsync({
          ...(fraccionamientoId ? { fraccionamientoId } : {}),
          nombre: nombre.trim(),
          monto: m,
          montoReconexion: rec,
          frecuenciaTipo,
          intervaloPeriodicidad: intervalo,
          diaCobro: dia,
          conCorteFisico,
        });
        setFeedback({ tipo: 'ok', mensaje: `Servicio "${nombre}" creado exitosamente` });
      }

      setModalAbierto(false);
      await serviciosQuery.refetch();
      if (onUpdated) onUpdated();
    } catch (err: unknown) {
      setFeedback({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error al guardar el servicio',
      });
    }
  }

  const servicios = (serviciosQuery.data ?? []) as ServicioItem[];
  const isBusy = crearMutation.isPending || editarMutation.isPending;

  return (
    <Card className="border border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
            Servicios Dinámicos y Cuotas del Fraccionamiento
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configura tarifas personalizadas, periodicidad de cobro y días de corte por cada servicio
          </p>
        </div>
        <Button size="sm" onClick={abrirCrear} className="h-8 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white">
          <Plus className="h-3.5 w-3.5" />
          Nuevo servicio
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
              feedback.tipo === 'error'
                ? 'border border-red-200 bg-red-50 text-red-800'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {feedback.tipo === 'error' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedback.mensaje}</span>
          </div>
        )}

        {serviciosQuery.isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Cargando catálogo de servicios...
          </div>
        ) : servicios.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay servicios adicionales configurados. Puedes dar de alta servicios como jardinería, vigilancia o mantenimiento.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-muted/50 text-muted-foreground border-b font-medium">
                <tr>
                  <th className="px-3 py-2.5">Servicio</th>
                  <th className="px-3 py-2.5">Periodicidad</th>
                  <th className="px-3 py-2.5">Día de cobro</th>
                  <th className="px-3 py-2.5">Tarifa</th>
                  <th className="px-3 py-2.5">Reconexión</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {servicios.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {s.nombre}
                      <span className="block text-[11px] text-muted-foreground font-mono">{s.clave}</span>
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      {s.frecuenciaTipo ?? 'mensual'}
                      {s.frecuenciaTipo === 'personalizado_dias' && s.intervaloPeriodicidad
                        ? ` (c/${s.intervaloPeriodicidad} días)`
                        : ''}
                    </td>
                    <td className="px-3 py-2.5">Día {s.diaCobro ?? 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-emerald-700">
                      ${Number(s.montoMensual).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      ${Number(s.montoReconexion).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={s.estado === 'activo' ? 'default' : 'secondary'} className="text-[10px]">
                        {s.estado}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => abrirEditar(s)}
                        title="Editar servicio"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Crear / Editar */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl border max-h-[90vh] overflow-y-auto">
              <h3 className="text-base font-bold text-foreground mb-1">
                {editando ? 'Editar Servicio Personalizado' : 'Nuevo Servicio Personalizado'}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Define las características operativas y financieras del concepto.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-nombre" className="text-xs">Nombre del servicio</Label>
                  <Input
                    id="srv-nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Vigilancia y Seguridad"
                    maxLength={100}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-monto" className="text-xs">Tarifa / Monto ($)</Label>
                    <Input
                      id="srv-monto"
                      type="number"
                      min="0"
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-reconexion" className="text-xs">Reconexión ($)</Label>
                    <Input
                      id="srv-reconexion"
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoReconexion}
                      onChange={(e) => setMontoReconexion(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-frecuencia" className="text-xs">Periodicidad</Label>
                    <select
                      id="srv-frecuencia"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={frecuenciaTipo}
                      onChange={(e) => setFrecuenciaTipo(e.target.value as Frecuencia)}
                    >
                      <option value="mensual">Mensual</option>
                      <option value="bimestral">Bimestral</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                      <option value="personalizado_dias">Días personalizados</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-dia" className="text-xs">Día de cobro (1-31)</Label>
                    <Input
                      id="srv-dia"
                      type="number"
                      min="1"
                      max="31"
                      value={diaCobro}
                      onChange={(e) => setDiaCobro(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {frecuenciaTipo === 'personalizado_dias' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-intervalo" className="text-xs">Intervalo de días</Label>
                    <Input
                      id="srv-intervalo"
                      type="number"
                      min="1"
                      value={intervaloPeriodicidad}
                      onChange={(e) => setIntervaloPeriodicidad(e.target.value)}
                      required
                    />
                  </div>
                )}

                {editando && (
                  <div className="space-y-1.5">
                    <Label htmlFor="srv-estado" className="text-xs">Estado</Label>
                    <select
                      id="srv-estado"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value as 'activo' | 'inactivo')}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalAbierto(false)}
                    disabled={isBusy}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white"
                    disabled={isBusy}
                  >
                    {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    {editando ? 'Guardar cambios' : 'Crear servicio'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
