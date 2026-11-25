'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
  Power,
  Save,
  Sliders,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ModalTab = 'licencia' | 'mercadopago' | 'transferencia';

type FraccionamientoItem = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  representanteId: string | null;
  tesoreraId: string | null;
  montoMensual: string;
  montoReconexion: string;
  diaCorte: number;
  limiteViviendas: number;
  esquemaTarifa: string;
  tipoNomenclatura?: 'edificio_depto' | 'solo_casa' | string;
  banco: string | null;
  clabe: string | null;
  titularCuenta: string | null;
  numeroCuenta: string | null;
  instruccionesTransferencia: string | null;
  mercadoPagoConfigurado: boolean;
};

type AuditoriaConsumoItem = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  limiteViviendas: number;
  esquemaTarifa: string;
  viviendasActivas: number;
  personalOperativo: number;
  volumenPagos: { cantidad: number; monto: number };
  volumenCargos: { cantidad: number; monto: number };
  estadoCumplimiento: 'Al corriente' | 'Excedido' | 'Requiere ajuste de tarifa';
};

export default function FraccionamientosAdminPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [montoMensual, setMontoMensual] = useState('50');
  const [montoReconexion, setMontoReconexion] = useState('300');
  const [diaCorte, setDiaCorte] = useState('5');
  const [limiteViviendas, setLimiteViviendas] = useState('50');
  const [esquemaTarifa, setEsquemaTarifa] = useState('sencillo');
  const [tipoNomenclatura, setTipoNomenclatura] = useState<'edificio_depto' | 'solo_casa'>('edificio_depto');

  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [configurando, setConfigurando] = useState<FraccionamientoItem | null>(null);
  const [metodoModalTab, setMetodoModalTab] = useState<ModalTab>('licencia');

  // Form states for modal
  const [modalMontoMensual, setModalMontoMensual] = useState('50');
  const [modalMontoReconexion, setModalMontoReconexion] = useState('300');
  const [modalDiaCorte, setModalDiaCorte] = useState('5');
  const [modalLimiteViviendas, setModalLimiteViviendas] = useState('50');
  const [modalEsquemaTarifa, setModalEsquemaTarifa] = useState('sencillo');
  const [modalTipoNomenclatura, setModalTipoNomenclatura] = useState<'edificio_depto' | 'solo_casa'>('edificio_depto');

  const [accessToken, setAccessToken] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [banco, setBanco] = useState('');
  const [clabe, setClabe] = useState('');
  const [titularCuenta, setTitularCuenta] = useState('');
  const [numeroCuenta, setNumeroCuenta] = useState('');
  const [instruccionesTransferencia, setInstruccionesTransferencia] = useState('');
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null);

  const fraccionamientosQuery = trpcReact.fraccionamientos.listar.useQuery();
  const auditoriaQuery = trpcReact.fraccionamientos.auditoriaConsumoReal.useQuery();

  const crearMutation = trpcReact.fraccionamientos.crear.useMutation();
  const actualizarConfiguracionMutation = trpcReact.fraccionamientos.actualizarConfiguracion.useMutation();
  const mercadoPagoMutation = trpcReact.fraccionamientos.actualizarMercadoPago.useMutation();
  const datosBancariosMutation = trpcReact.fraccionamientos.actualizarDatosBancarios.useMutation();
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
        limiteViviendas: Number(limiteViviendas) || 50,
        esquemaTarifa: esquemaTarifa.trim() || 'sencillo',
        tipoNomenclatura,
      });
      setNombre('');
      setMensaje(`Fraccionamiento “${creado.nombre}” creado correctamente`);
      await Promise.all([fraccionamientosQuery.refetch(), auditoriaQuery.refetch()]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el fraccionamiento');
    }
  }

  function abrirModalConfiguracion(f: FraccionamientoItem, tab: ModalTab = 'licencia') {
    setConfigurando(f);
    setMetodoModalTab(tab);
    setErrorConfiguracion(null);
    setModalMontoMensual(f.montoMensual);
    setModalMontoReconexion(f.montoReconexion);
    setModalDiaCorte(String(f.diaCorte));
    setModalLimiteViviendas(String(f.limiteViviendas ?? 50));
    setModalEsquemaTarifa(f.esquemaTarifa ?? 'sencillo');
    setModalTipoNomenclatura((f.tipoNomenclatura as 'edificio_depto' | 'solo_casa') ?? 'edificio_depto');
    setAccessToken('');
    setCollectorId('');
    setBanco(f.banco ?? '');
    setClabe(f.clabe ?? '');
    setTitularCuenta(f.titularCuenta ?? '');
    setNumeroCuenta(f.numeroCuenta ?? '');
    setInstruccionesTransferencia(f.instruccionesTransferencia ?? '');
  }

  async function guardarLicenciaYTarifa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configurando) return;
    setErrorConfiguracion(null);
    try {
      await actualizarConfiguracionMutation.mutateAsync({
        fraccionamientoId: configurando.id,
        montoMensual: Number(modalMontoMensual),
        montoReconexion: Number(modalMontoReconexion),
        diaCorte: Number(modalDiaCorte),
        activo: configurando.activo,
        limiteViviendas: Number(modalLimiteViviendas) || 50,
        esquemaTarifa: modalEsquemaTarifa.trim() || 'sencillo',
        tipoNomenclatura: modalTipoNomenclatura,
      });
      setMensaje('Capacidad de licenciamiento y cuotas actualizadas correctamente');
      setConfigurando(null);
      await Promise.all([fraccionamientosQuery.refetch(), auditoriaQuery.refetch()]);
    } catch (cause: unknown) {
      setErrorConfiguracion(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración');
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
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setErrorConfiguracion(cause instanceof Error ? cause.message : 'No se pudo guardar Mercado Pago');
    }
  }

  async function guardarDatosBancarios(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configurando) return;
    setErrorConfiguracion(null);
    try {
      await datosBancariosMutation.mutateAsync({
        fraccionamientoId: configurando.id,
        banco: banco.trim() || null,
        clabe: clabe.trim() || null,
        titularCuenta: titularCuenta.trim() || null,
        numeroCuenta: numeroCuenta.trim() || null,
        instruccionesTransferencia: instruccionesTransferencia.trim() || null,
      });
      setMensaje('Datos bancarios de transferencia actualizados correctamente');
      setConfigurando(null);
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setErrorConfiguracion(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos bancarios');
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
      await Promise.all([fraccionamientosQuery.refetch(), auditoriaQuery.refetch()]);
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
      await Promise.all([fraccionamientosQuery.refetch(), auditoriaQuery.refetch()]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el fraccionamiento');
    }
  }

  function exportarAuditoriaCSV(data: AuditoriaConsumoItem[]) {
    const headers = [
      'Fraccionamiento',
      'Slug',
      'Estado Tenant',
      'Viviendas Activas',
      'Límite Contratado',
      'Esquema Tarifa',
      'Personal Operativo',
      'Pagos Aprobados (Cant)',
      'Pagos Aprobados (Monto)',
      'Cargos Generados (Cant)',
      'Cargos Generados (Monto)',
      'Estado Cumplimiento',
    ];
    const rows = data.map(d => [
      `"${d.nombre.replace(/"/g, '""')}"`,
      `"${d.slug}"`,
      d.activo ? 'Activo' : 'Inactivo',
      d.viviendasActivas,
      d.limiteViviendas,
      `"${d.esquemaTarifa}"`,
      d.personalOperativo,
      d.volumenPagos.cantidad,
      d.volumenPagos.monto.toFixed(2),
      d.volumenCargos.cantidad,
      d.volumenCargos.monto.toFixed(2),
      `"${d.estadoCumplimiento}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_consumo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const fraccionamientos = (fraccionamientosQuery.data ?? []) as FraccionamientoItem[];
  const auditoriaItems = (auditoriaQuery.data ?? []) as AuditoriaConsumoItem[];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8" />
              <div>
                <h1 className="text-3xl font-bold">Fraccionamientos y Licenciamiento</h1>
                <p className="mt-1 text-sky-100">Control de tenants, límites de capacidad y conciliación de consumo</p>
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

        {/* Formulario de Creación */}
        <Card>
          <CardHeader>
            <CardTitle>Crear nuevo fraccionamiento</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 md:items-end" onSubmit={crearFraccionamiento}>
              <div className="space-y-2 lg:col-span-2">
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
                <Label htmlFor="monto-reconexion">Monto reconexión</Label>
                <Input id="monto-reconexion" type="number" min="0" step="0.01" value={montoReconexion} onChange={(event) => setMontoReconexion(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dia-corte">Día de corte</Label>
                <Input id="dia-corte" type="number" min="1" max="28" step="1" value={diaCorte} onChange={(event) => setDiaCorte(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="limite-viviendas">Límite viviendas</Label>
                <Input id="limite-viviendas" type="number" min="1" step="1" value={limiteViviendas} onChange={(event) => setLimiteViviendas(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="esquema-tarifa">Esquema tarifa</Label>
                <Input id="esquema-tarifa" type="text" value={esquemaTarifa} onChange={(event) => setEsquemaTarifa(event.target.value)} required />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="tipo-nomenclatura">Nomenclatura</Label>
                <select
                  id="tipo-nomenclatura"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={tipoNomenclatura}
                  onChange={(event) => setTipoNomenclatura(event.target.value as 'edificio_depto' | 'solo_casa')}
                >
                  <option value="edificio_depto">Edificio y Departamento</option>
                  <option value="solo_casa">Solo Número de Casa</option>
                </select>
              </div>
              <div className="lg:col-span-6 flex justify-end">
                <Button type="submit" disabled={crearMutation.isPending}>
                  {crearMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Crear fraccionamiento
                </Button>
              </div>
            </form>
            <p className="mt-3 text-sm text-muted-foreground">
              Define el límite contratado de viviendas y el esquema de cobro para controlar el licenciamiento multi-tenant.
            </p>
          </CardContent>
        </Card>

        {/* Catálogo de Fraccionamientos */}
        <Card>
          <CardHeader>
            <CardTitle>Fraccionamientos Activos</CardTitle>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${fraccionamiento.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                        {fraccionamiento.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        Capacidad: {fraccionamiento.limiteViviendas ?? 50} viv. ({fraccionamiento.esquemaTarifa ?? 'sencillo'})
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        fraccionamiento.mercadoPagoConfigurado
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        MP: {fraccionamiento.mercadoPagoConfigurado ? 'configurado' : 'pendiente'}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        fraccionamiento.clabe || fraccionamiento.numeroCuenta
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        SPEI: {fraccionamiento.clabe || fraccionamiento.numeroCuenta ? 'configurado' : 'pendiente'}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!fraccionamiento.activo}
                        onClick={() => abrirModalConfiguracion(fraccionamiento, 'licencia')}
                      >
                        <Sliders className="mr-2 h-4 w-4" />Configurar
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

        {/* Auditoría de Consumo Real y Conciliación por Tenant (HU-S4-03) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-sky-600" />
              <CardTitle>Auditoría de Consumo Real y Conciliación</CardTitle>
            </div>
            {auditoriaItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportarAuditoriaCSV(auditoriaItems)}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {auditoriaQuery.isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : auditoriaItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay datos de consumo para mostrar.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs font-semibold text-slate-700 uppercase">
                    <tr>
                      <th className="px-4 py-3">Fraccionamiento</th>
                      <th className="px-4 py-3">Viviendas / Límite</th>
                      <th className="px-4 py-3">Plan / Tarifa</th>
                      <th className="px-4 py-3">Personal</th>
                      <th className="px-4 py-3">Pagos Aprobados</th>
                      <th className="px-4 py-3">Cargos Generados</th>
                      <th className="px-4 py-3">Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {auditoriaItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {item.nombre}
                          <span className="block text-xs text-muted-foreground">/{item.slug}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {item.viviendasActivas} / {item.limiteViviendas}
                        </td>
                        <td className="px-4 py-3 capitalize">{item.esquemaTarifa}</td>
                        <td className="px-4 py-3">{item.personalOperativo}</td>
                        <td className="px-4 py-3">
                          {item.volumenPagos.cantidad} (${item.volumenPagos.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })})
                        </td>
                        <td className="px-4 py-3">
                          {item.volumenCargos.cantidad} (${item.volumenCargos.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })})
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.estadoCumplimiento === 'Al corriente'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.estadoCumplimiento === 'Requiere ajuste de tarifa'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {item.estadoCumplimiento}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Configuración */}
      {configurando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="metodo-pago-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="metodo-pago-title" className="text-lg font-semibold">Configuración de Fraccionamiento</h2>
                <p className="mt-1 text-sm text-muted-foreground">{configurando.nombre}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Cerrar" onClick={() => setConfigurando(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex border-b border-border">
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  metodoModalTab === 'licencia'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => { setMetodoModalTab('licencia'); setErrorConfiguracion(null); }}
              >
                <Sliders className="h-4 w-4" />
                Capacidad y Plan
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  metodoModalTab === 'mercadopago'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => { setMetodoModalTab('mercadopago'); setErrorConfiguracion(null); }}
              >
                <KeyRound className="h-4 w-4" />
                Mercado Pago
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  metodoModalTab === 'transferencia'
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => { setMetodoModalTab('transferencia'); setErrorConfiguracion(null); }}
              >
                <Landmark className="h-4 w-4" />
                Transferencia SPEI
              </button>
            </div>

            {metodoModalTab === 'licencia' ? (
              <form onSubmit={guardarLicenciaYTarifa} className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ajusta el límite máximo de viviendas contratadas y las cuotas de operación de este fraccionamiento.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="modal-limite-viviendas">Límite de viviendas contratadas</Label>
                    <Input
                      id="modal-limite-viviendas"
                      type="number"
                      min="1"
                      step="1"
                      value={modalLimiteViviendas}
                      onChange={(e) => setModalLimiteViviendas(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modal-esquema-tarifa">Esquema de tarifa</Label>
                    <Input
                      id="modal-esquema-tarifa"
                      value={modalEsquemaTarifa}
                      onChange={(e) => setModalEsquemaTarifa(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="modal-tipo-nomenclatura">Nomenclatura de Unidades</Label>
                    <select
                      id="modal-tipo-nomenclatura"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={modalTipoNomenclatura}
                      onChange={(e) => setModalTipoNomenclatura(e.target.value as 'edificio_depto' | 'solo_casa')}
                    >
                      <option value="edificio_depto">Edificio y Departamento</option>
                      <option value="solo_casa">Solo Número de Casa</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="modal-monto-mensual">Monto mensual</Label>
                    <Input
                      id="modal-monto-mensual"
                      type="number"
                      min="0"
                      step="0.01"
                      value={modalMontoMensual}
                      onChange={(e) => setModalMontoMensual(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modal-monto-reconexion">Reconexión</Label>
                    <Input
                      id="modal-monto-reconexion"
                      type="number"
                      min="0"
                      step="0.01"
                      value={modalMontoReconexion}
                      onChange={(e) => setModalMontoReconexion(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modal-dia-corte">Día corte</Label>
                    <Input
                      id="modal-dia-corte"
                      type="number"
                      min="1"
                      max="28"
                      value={modalDiaCorte}
                      onChange={(e) => setModalDiaCorte(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {errorConfiguracion && <p role="alert" className="text-sm text-red-700">{errorConfiguracion}</p>}
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfigurando(null)}>Cancelar</Button>
                  <Button type="submit" disabled={actualizarConfiguracionMutation.isPending}>
                    {actualizarConfiguracionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Capacidad
                  </Button>
                </div>
              </form>
            ) : metodoModalTab === 'mercadopago' ? (
              <form onSubmit={guardarMercadoPago} className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  La configuración de Mercado Pago pertenece al fraccionamiento. El token se cifra y no volverá a mostrarse.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="mp-access-token">Access Token</Label>
                  <Input
                    id="mp-access-token"
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder="APP_USR-..."
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Déjalo vacío para conservar el token ya configurado.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mp-collector-id">Collector ID</Label>
                  <Input
                    id="mp-collector-id"
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={collectorId}
                    onChange={(event) => setCollectorId(event.target.value)}
                    placeholder="123456789"
                    required
                  />
                </div>
                {errorConfiguracion && <p role="alert" className="text-sm text-red-700">{errorConfiguracion}</p>}
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfigurando(null)}>Cancelar</Button>
                  <Button type="submit" disabled={mercadoPagoMutation.isPending}>
                    {mercadoPagoMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Mercado Pago
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={guardarDatosBancarios} className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Datos de la cuenta bancaria de tesorería para que los residentes realicen transferencias directas (SPEI).
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="banco">Banco</Label>
                    <Input
                      id="banco"
                      value={banco}
                      onChange={(event) => setBanco(event.target.value)}
                      placeholder="BBVA, Santander, Banorte..."
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titular-cuenta">Titular de la cuenta</Label>
                    <Input
                      id="titular-cuenta"
                      value={titularCuenta}
                      onChange={(event) => setTitularCuenta(event.target.value)}
                      placeholder="Nombre del tesorero o razón social"
                      maxLength={150}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clabe">CLABE Interbancaria (18 dígitos)</Label>
                    <Input
                      id="clabe"
                      value={clabe}
                      onChange={(event) => setClabe(event.target.value)}
                      placeholder="012180001234567890"
                      maxLength={18}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="numero-cuenta">Número de cuenta</Label>
                    <Input
                      id="numero-cuenta"
                      value={numeroCuenta}
                      onChange={(event) => setNumeroCuenta(event.target.value)}
                      placeholder="Número de cuenta bancaria"
                      maxLength={30}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instrucciones-transferencia">Instrucciones / Concepto sugerido</Label>
                  <Input
                    id="instrucciones-transferencia"
                    value={instruccionesTransferencia}
                    onChange={(event) => setInstruccionesTransferencia(event.target.value)}
                    placeholder="Ej. Colocar en concepto: Edif [letra] Depto [num]"
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground">Estas instrucciones se mostrarán a los residentes al pagar por transferencia.</p>
                </div>
                {errorConfiguracion && <p role="alert" className="text-sm text-red-700">{errorConfiguracion}</p>}
                <div className="mt-6 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setConfigurando(null)}>Cancelar</Button>
                  <Button type="submit" disabled={datosBancariosMutation.isPending}>
                    {datosBancariosMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Datos Bancarios
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
