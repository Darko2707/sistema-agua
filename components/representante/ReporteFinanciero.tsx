'use client';

import { useState } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import {
  FileDown, Plus, Pencil, Trash2, Loader2,
  TrendingUp, Users, AlertTriangle, DollarSign, Wallet,
} from 'lucide-react';

import { Button }      from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input }       from '@/components/ui/input';
import { Label }       from '@/components/ui/label';
import { Badge }       from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CatGasto = 'mantenimiento' | 'administracion' | 'servicios' | 'otros';

type IngresoEditing = { id: string; concepto: string; monto: number; fecha: string } | null;

const CAT_LABEL: Record<CatGasto, string> = {
  mantenimiento: 'Mantenimiento',
  administracion: 'Administración',
  servicios: 'Servicios',
  otros: 'Otros',
};

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function mxn(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = 'text-foreground' }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon}
          {label}
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-slate-200 rounded-xl" />)}
      </div>
      <div className="h-40 bg-slate-100 rounded-xl" />
      <div className="h-40 bg-slate-100 rounded-xl" />
    </div>
  );
}

// ─── Modal de gastos ─────────────────────────────────────────────────────────

interface GastoModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  inicial?: {
    id?: string;
    concepto: string;
    monto: number;
    categoria: CatGasto;
    fecha: string;
  };
  mes: number;
  anio: number;
  onGuardar: (d: { concepto: string; monto: number; categoria: CatGasto; fecha: string }) => Promise<void>;
}

function GastoModal({ open, onClose, titulo, inicial, mes, anio, onGuardar }: GastoModalProps) {
  const hoy = new Date().toISOString().split('T')[0];
  const [concepto,   setConcepto]   = useState(inicial?.concepto   ?? '');
  const [monto,      setMonto]      = useState(inicial?.monto      ?? 0);
  const [categoria,  setCategoria]  = useState<CatGasto>(inicial?.categoria ?? 'otros');
  const [fecha,      setFecha]      = useState(inicial?.fecha ?? hoy);
  const [guardando,  setGuardando]  = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concepto.trim()) { setErrMsg('El concepto es requerido'); return; }
    if (monto <= 0)        { setErrMsg('El monto debe ser mayor a 0'); return; }
    setGuardando(true);
    setErrMsg('');
    try {
      await onGuardar({ concepto: concepto.trim(), monto, categoria, fecha });
      onClose();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{MESES_FULL[mes - 1]} {anio}</p>

        {errMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="concepto">Concepto *</Label>
            <Input
              id="concepto"
              placeholder="Ej. Reparación de tubería"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="monto">Monto (MXN) *</Label>
            <Input
              id="monto"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={monto || ''}
              onChange={e => setMonto(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="categoria">Categoría *</Label>
            <select
              id="categoria"
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={categoria}
              onChange={e => setCategoria(e.target.value as CatGasto)}
            >
              <option value="mantenimiento">Mantenimiento</option>
              <option value="administracion">Administración</option>
              <option value="servicios">Servicios</option>
              <option value="otros">Otros</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="fecha">Fecha *</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="gap-2">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal de ingresos adicionales ───────────────────────────────────────────

interface IngresoModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  inicial?: { id?: string; concepto: string; monto: number; fecha: string };
  mes: number;
  anio: number;
  onGuardar: (d: { concepto: string; monto: number; fecha: string }) => Promise<void>;
}

function IngresoModal({ open, onClose, titulo, inicial, mes, anio, onGuardar }: IngresoModalProps) {
  const hoy = new Date().toISOString().split('T')[0];
  const [concepto,  setConcepto]  = useState(inicial?.concepto ?? '');
  const [monto,     setMonto]     = useState(inicial?.monto    ?? 0);
  const [fecha,     setFecha]     = useState(inicial?.fecha    ?? hoy);
  const [guardando, setGuardando] = useState(false);
  const [errMsg,    setErrMsg]    = useState('');

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concepto.trim()) { setErrMsg('El concepto es requerido'); return; }
    if (monto <= 0)        { setErrMsg('El monto debe ser mayor a 0'); return; }
    setGuardando(true);
    setErrMsg('');
    try {
      await onGuardar({ concepto: concepto.trim(), monto, fecha });
      onClose();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1]} {anio}</p>

        {errMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="ing-concepto">Concepto *</Label>
            <Input id="ing-concepto" placeholder="Ej. Cuotas cobradas antes del sistema" value={concepto} onChange={e => setConcepto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ing-monto">Monto (MXN) *</Label>
            <Input id="ing-monto" type="number" min="0.01" step="0.01" placeholder="0.00" value={monto || ''} onChange={e => setMonto(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ing-fecha">Fecha *</Label>
            <Input id="ing-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button type="submit" disabled={guardando} className="gap-2 bg-green-600 hover:bg-green-700">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Notificación toast simple ────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);
  function mostrar(msg: string, tipo: 'ok' | 'error' = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }
  return { toast, mostrar };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReporteFinanciero() {
  const hoy  = new Date();
  const [mes,  setMes]  = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());

  const [modalAbierto,       setModalAbierto]       = useState(false);
  const [gastoEditando,      setGastoEditando]       = useState<null | {
    id: string; concepto: string; monto: number; categoria: CatGasto; fecha: string;
  }>(null);
  const [ingresoModalAbierto, setIngresoModalAbierto] = useState(false);
  const [ingresoEditando,     setIngresoEditando]     = useState<IngresoEditing>(null);
  const [descargando,         setDescargando]         = useState(false);
  const [eliminandoId,        setEliminandoId]        = useState<string | null>(null);
  const [eliminandoIngresoId, setEliminandoIngresoId] = useState<string | null>(null);
  const { toast, mostrar } = useToast();

  const utils = trpcReact.useUtils();

  const reporteQuery = trpcReact.reportes.reporteFinanciero.useQuery({ mes, anio });

  const agregarMutation  = trpcReact.reportes.agregarGasto.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Gasto registrado correctamente'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });

  const editarMutation   = trpcReact.reportes.editarGasto.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Gasto actualizado correctamente'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });

  const eliminarMutation = trpcReact.reportes.eliminarGasto.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Gasto eliminado'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });

  const agregarIngresoMutation  = trpcReact.reportes.agregarIngreso.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Ingreso registrado correctamente'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });
  const editarIngresoMutation   = trpcReact.reportes.editarIngreso.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Ingreso actualizado correctamente'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });
  const eliminarIngresoMutation = trpcReact.reportes.eliminarIngreso.useMutation({
    onSuccess: () => { utils.reportes.reporteFinanciero.invalidate(); mostrar('Ingreso eliminado'); },
    onError:   (e) => mostrar(e.message, 'error'),
  });

  const reporte  = reporteQuery.data;
  const cargando = reporteQuery.isLoading;
  const error    = reporteQuery.error?.message;

  // Años disponibles (3 años anteriores + actual + 1 futuro)
  const aniosOpts = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);

  async function handleAgregarGasto(d: { concepto: string; monto: number; categoria: CatGasto; fecha: string }) {
    await agregarMutation.mutateAsync({ ...d, mes, anio });
  }

  async function handleEditarGasto(d: { concepto: string; monto: number; categoria: CatGasto; fecha: string }) {
    if (!gastoEditando) return;
    await editarMutation.mutateAsync({ id: gastoEditando.id, ...d });
  }

  async function handleEliminarGasto(id: string) {
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return;
    setEliminandoId(id);
    try {
      await eliminarMutation.mutateAsync({ id });
    } finally {
      setEliminandoId(null);
    }
  }

  async function handleAgregarIngreso(d: { concepto: string; monto: number; fecha: string }) {
    await agregarIngresoMutation.mutateAsync({ ...d, mes, anio });
  }
  async function handleEditarIngreso(d: { concepto: string; monto: number; fecha: string }) {
    if (!ingresoEditando) return;
    await editarIngresoMutation.mutateAsync({ id: ingresoEditando.id, ...d });
  }
  async function handleEliminarIngreso(id: string) {
    if (!confirm('¿Eliminar este ingreso? Esta acción no se puede deshacer.')) return;
    setEliminandoIngresoId(id);
    try {
      await eliminarIngresoMutation.mutateAsync({ id });
    } finally {
      setEliminandoIngresoId(null);
    }
  }

  async function exportarExcel() {
    setDescargando(true);
    try {
      const res  = await fetch(`/api/reportes/financiero?mes=${mes}&anio=${anio}`);
      if (!res.ok) throw new Error('Error al generar Excel');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `reporte-financiero-${mes}-${anio}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      mostrar('No se pudo generar el Excel. Intenta nuevamente.', 'error');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg transition-opacity ${toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Selector de período */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex gap-2 flex-wrap items-end">
              <div className="space-y-1">
                <Label>Mes</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={mes}
                  onChange={e => setMes(parseInt(e.target.value, 10))}
                >
                  {MESES_FULL.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Año</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={anio}
                  onChange={e => setAnio(parseInt(e.target.value, 10))}
                >
                  {aniosOpts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="md:ml-auto">
              <Button onClick={exportarExcel} disabled={descargando || cargando} variant="outline" className="gap-2">
                {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Exportar Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {cargando ? <Skeleton /> : reporte ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Total recaudado"
              value={mxn(reporte.totalRecaudado)}
              color="text-green-600"
            />
            <KpiCard
              icon={<Users className="h-4 w-4" />}
              label="Residentes"
              value={String(reporte.totalResidentes)}
              sub={`${reporte.totalPagaron} pagaron`}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Morosos"
              value={String(reporte.totalMorosos)}
              color={reporte.totalMorosos > 0 ? 'text-red-600' : 'text-green-600'}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="% Cobranza"
              value={`${reporte.porcentajeCobranza.toFixed(1)}%`}
              color={reporte.porcentajeCobranza >= 80 ? 'text-green-600' : 'text-amber-600'}
            />
          </div>

          {/* Saldo */}
          <Card className={reporte.saldo >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Saldo del período</span>
                  <span className="text-xs text-muted-foreground">
                    (pagos {mxn(reporte.totalPagos ?? reporte.totalRecaudado)}
                    {(reporte.totalIngresosAdicionales ?? 0) > 0 ? ` + extras ${mxn(reporte.totalIngresosAdicionales ?? 0)}` : ''}
                    {' '}− gastos {mxn(reporte.totalGastos)})
                  </span>
                </div>
                <span className={`text-2xl font-bold ${reporte.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {mxn(reporte.saldo)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Desglose por edificio */}
          <Card>
            <CardHeader>
              <CardTitle>Desglose por edificio</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Edificio</TableHead>
                    <TableHead className="text-right">Total pagado</TableHead>
                    <TableHead className="text-center"># Pagos</TableHead>
                    <TableHead className="text-center">Activos</TableHead>
                    <TableHead className="text-center">Morosos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporte.porEdificio.map(ed => (
                    <TableRow key={ed.edificio}>
                      <TableCell className="font-medium">{ed.edificio}</TableCell>
                      <TableCell className="text-right text-green-700 font-medium">{mxn(ed.totalPagado)}</TableCell>
                      <TableCell className="text-center">{ed.cantidadPagos}</TableCell>
                      <TableCell className="text-center text-green-600">{ed.residentesActivos}</TableCell>
                      <TableCell className="text-center">
                        <span className={ed.residentesMorosos > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          {ed.residentesMorosos}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reporte.porEdificio.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Sin datos para este período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Gastos */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Gastos del período</CardTitle>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => { setGastoEditando(null); setModalAbierto(true); }}
                >
                  <Plus className="h-4 w-4" />
                  Agregar gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reporte.gastos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Sin gastos registrados para {MESES_FULL[mes - 1]} {anio}.
                        <br />
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1"
                          onClick={() => { setGastoEditando(null); setModalAbierto(true); }}
                        >
                          Registrar primer gasto
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {reporte.gastos.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.concepto}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CAT_LABEL[g.categoria as CatGasto] ?? g.categoria}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(g.fecha!).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {mxn(Number(g.monto))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setGastoEditando({
                                id:        g.id,
                                concepto:  g.concepto,
                                monto:     Number(g.monto),
                                categoria: g.categoria as CatGasto,
                                fecha:     g.fecha
                                  ? new Date(g.fecha).toISOString().split('T')[0]
                                  : new Date().toISOString().split('T')[0],
                              });
                              setModalAbierto(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={eliminandoId === g.id}
                            onClick={() => handleEliminarGasto(g.id)}
                          >
                            {eliminandoId === g.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {reporte.gastos.length > 0 && (
                <div className="flex justify-end items-center gap-2 border-t px-4 py-3">
                  <span className="text-sm text-muted-foreground">Total gastos:</span>
                  <span className="font-bold text-red-600 text-lg">{mxn(reporte.totalGastos)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ingresos adicionales */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ingresos adicionales</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ingresos cobrados fuera del sistema (cuotas históricas, pagos en efectivo previos, etc.)
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  onClick={() => { setIngresoEditando(null); setIngresoModalAbierto(true); }}
                >
                  <Plus className="h-4 w-4" />
                  Agregar ingreso
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reporte.ingresos ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Sin ingresos adicionales para {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1]} {anio}.
                        <br />
                        <Button variant="link" size="sm" className="mt-1" onClick={() => { setIngresoEditando(null); setIngresoModalAbierto(true); }}>
                          Registrar primer ingreso adicional
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {(reporte.ingresos ?? []).map(ing => (
                    <TableRow key={ing.id}>
                      <TableCell className="font-medium">{ing.concepto}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(ing.fecha!).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-700">
                        {mxn(Number(ing.monto))}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => {
                              setIngresoEditando({
                                id:       ing.id,
                                concepto: ing.concepto,
                                monto:    Number(ing.monto),
                                fecha:    ing.fecha ? new Date(ing.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                              });
                              setIngresoModalAbierto(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={eliminandoIngresoId === ing.id}
                            onClick={() => handleEliminarIngreso(ing.id)}
                          >
                            {eliminandoIngresoId === ing.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {(reporte.ingresos ?? []).length > 0 && (
                <div className="flex justify-end items-center gap-2 border-t px-4 py-3">
                  <span className="text-sm text-muted-foreground">Total ingresos adicionales:</span>
                  <span className="font-bold text-green-700 text-lg">{mxn(reporte.totalIngresosAdicionales ?? 0)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Modal agregar/editar gasto */}
      <GastoModal
        open={modalAbierto}
        onClose={() => { setModalAbierto(false); setGastoEditando(null); }}
        titulo={gastoEditando ? 'Editar gasto' : 'Agregar gasto'}
        inicial={gastoEditando ?? undefined}
        mes={mes}
        anio={anio}
        onGuardar={gastoEditando ? handleEditarGasto : handleAgregarGasto}
      />

      {/* Modal agregar/editar ingreso adicional */}
      <IngresoModal
        open={ingresoModalAbierto}
        onClose={() => { setIngresoModalAbierto(false); setIngresoEditando(null); }}
        titulo={ingresoEditando ? 'Editar ingreso adicional' : 'Agregar ingreso adicional'}
        inicial={ingresoEditando ?? undefined}
        mes={mes}
        anio={anio}
        onGuardar={ingresoEditando ? handleEditarIngreso : handleAgregarIngreso}
      />
    </div>
  );
}
