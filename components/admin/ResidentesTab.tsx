'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';
import { ROLES, type Circuito, type ResidenteCompleto } from '@/hooks/useAdmin';

const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTO  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Genera los últimos N meses anteriores al mes actual
function generarMesesPasados(n = 24): Array<{ mes: number; anio: number; label: string }> {
  const items = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  for (let i = 0; i < n; i++) {
    const mes  = d.getMonth() + 1;
    const anio = d.getFullYear();
    items.push({ mes, anio, label: `${MESES_NOMBRE[mes - 1]} ${anio}` });
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  return items;
}

const MESES_PASADOS = generarMesesPasados(24);

type MesAnio = { mes: number; anio: number };

type Props = {
  residentesFiltrados:        ResidenteCompleto[];
  circuitos:                  Circuito[];
  filtroCircuito:             string;
  setFiltroCircuito:          (v: string) => void;
  filtroEstado:               string;
  setFiltroEstado:            (v: string) => void;
  actualizando:               string | null;
  onCambiarRol:               (userId: string, rol: string) => void;
  onRegistrarPagoRetroactivo: (
    perfilId: string,
    meses: MesAnio[],
    metodo: 'efectivo' | 'transferencia',
  ) => Promise<{ registrados: number; omitidos: string[] }>;
  onLimpiarFiltros:           () => void;
};

export function ResidentesTab({
  residentesFiltrados,
  circuitos,
  filtroCircuito,
  setFiltroCircuito,
  filtroEstado,
  setFiltroEstado,
  actualizando,
  onCambiarRol,
  onRegistrarPagoRetroactivo,
  onLimpiarFiltros,
}: Props) {
  const [modalResidente, setModalResidente] = useState<ResidenteCompleto | null>(null);
  const [mesesSel,       setMesesSel]       = useState<MesAnio[]>([]);
  const [metodoSel,      setMetodoSel]      = useState<'efectivo' | 'transferencia'>('efectivo');
  const [registrando,    setRegistrando]    = useState(false);
  const [resultado,      setResultado]      = useState<{ registrados: number; omitidos: string[] } | null>(null);
  const [errorModal,     setErrorModal]     = useState<string | null>(null);

  function abrirModal(r: ResidenteCompleto) {
    setModalResidente(r);
    setMesesSel([]);
    setMetodoSel('efectivo');
    setResultado(null);
    setErrorModal(null);
  }

  function cerrarModal() {
    if (registrando) return;
    setModalResidente(null);
    setResultado(null);
    setErrorModal(null);
  }

  function toggleMes(mes: number, anio: number) {
    setMesesSel(prev => {
      const existe = prev.some(m => m.mes === mes && m.anio === anio);
      if (existe) return prev.filter(m => !(m.mes === mes && m.anio === anio));
      return [...prev, { mes, anio }];
    });
  }

  function estaSeleccionado(mes: number, anio: number) {
    return mesesSel.some(m => m.mes === mes && m.anio === anio);
  }

  async function handleRegistrar() {
    if (!modalResidente || mesesSel.length === 0) return;
    setRegistrando(true);
    setErrorModal(null);
    setResultado(null);
    try {
      const res = await onRegistrarPagoRetroactivo(modalResidente.id, mesesSel, metodoSel);
      setResultado(res);
      setMesesSel([]);
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : 'Error al registrar los pagos');
    } finally {
      setRegistrando(false);
    }
  }

  // Agrupa meses pasados por año para mostrarlos ordenados
  const porAnio = useMemo(() => {
    const mapa = new Map<number, typeof MESES_PASADOS>();
    for (const item of MESES_PASADOS) {
      if (!mapa.has(item.anio)) mapa.set(item.anio, []);
      mapa.get(item.anio)!.push(item);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0] - a[0]);
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Todos los residentes</CardTitle>
          <div className="mt-2 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Circuito:</label>
              <select
                value={filtroCircuito}
                onChange={(e) => setFiltroCircuito(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="todos">Todos</option>
                {circuitos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Estado:</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="h-9 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="activo">Activo</option>
                <option value="pendiente_corte">Pendiente corte</option>
                <option value="cortado">Cortado</option>
                <option value="pendiente_reconexion">Pendiente reconexión</option>
              </select>
            </div>

            <Button variant="outline" size="sm" onClick={onLimpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {residentesFiltrados.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">
              No hay residentes que coincidan con los filtros.
            </p>
          )}
          {residentesFiltrados.map((r) => {
            const usuarioId = r.usuario?.id || r.id;
            return (
              <div
                key={r.id}
                className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1">
                  <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.usuario?.email || 'Sin email'}</p>
                  {r.tenencia === 'inquilino' && r.nombrePropietario && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      Inquilino · Dueño: {r.nombrePropietario}
                      {r.telefonoPropietario ? ` · ${r.telefonoPropietario}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <EstadoAguaBadge estado={r.estadoAgua} />
                  {r.estadoAgua === 'activo' && r.pagoEsteMes && (
                    <Badge variant="default" className="bg-green-600 font-medium">Pagado</Badge>
                  )}
                  {r.estadoAgua === 'activo' && r.esMoroso && !r.pagoEsteMes && (
                    <Badge variant="outline" className="border-amber-300 font-medium text-amber-600">
                      Moroso
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => abrirModal(r)}
                  >
                    + Pagos anteriores
                  </Button>
                  <select
                    value={r.usuario?.role || 'residente'}
                    disabled={actualizando === r.id}
                    onChange={(e) => onCambiarRol(usuarioId, e.target.value)}
                    className="h-9 rounded-lg border bg-background px-2 text-sm md:w-40"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                  {actualizando === r.id && (
                    <span className="text-xs text-muted-foreground">Guardando...</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Modal pagos retroactivos ── */}
      {modalResidente && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">Registrar pagos anteriores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {modalResidente.usuario?.name} · {modalResidente.circuito?.nombre} · Edif.{' '}
              {modalResidente.edificio} · Depto. {modalResidente.departamento}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Los pagos retroactivos no generan folio ni afectan el estado del servicio.
            </p>

            <div className="mt-4 space-y-4">
              {/* Selector de meses */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Selecciona los meses a registrar
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-sky-600 hover:underline"
                      onClick={() => setMesesSel(MESES_PASADOS.map(({ mes, anio }) => ({ mes, anio })))}
                    >
                      Todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      className="text-slate-500 hover:underline"
                      onClick={() => setMesesSel([])}
                    >
                      Ninguno
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                  {porAnio.map(([anio, meses]) => (
                    <div key={anio}>
                      <p className="sticky top-0 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{anio}</p>
                      <div className="grid grid-cols-3 gap-px p-2">
                        {meses.map(({ mes, anio: a }) => {
                          const sel = estaSeleccionado(mes, a);
                          return (
                            <button
                              key={`${a}-${mes}`}
                              type="button"
                              onClick={() => toggleMes(mes, a)}
                              className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                                sel
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {MESES_CORTO[mes - 1]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {mesesSel.length > 0 && (
                  <p className="mt-1.5 text-xs text-sky-700 font-medium">
                    {mesesSel.length} {mesesSel.length === 1 ? 'mes seleccionado' : 'meses seleccionados'}
                  </p>
                )}
              </div>

              {/* Método de pago */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Método de pago</label>
                <select
                  value={metodoSel}
                  onChange={(e) => setMetodoSel(e.target.value as 'efectivo' | 'transferencia')}
                  disabled={registrando}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>

              {errorModal && (
                <div role="alert" aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {errorModal}
                </div>
              )}

              {resultado && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 space-y-0.5">
                  <p className="font-medium">
                    {resultado.registrados} {resultado.registrados === 1 ? 'pago registrado' : 'pagos registrados'}
                  </p>
                  {resultado.omitidos.length > 0 && (
                    <p className="text-amber-700">
                      Omitidos (ya existían): {resultado.omitidos.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={cerrarModal} disabled={registrando}>
                {resultado ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!resultado && (
                <Button
                  onClick={handleRegistrar}
                  disabled={registrando || mesesSel.length === 0}
                >
                  {registrando
                    ? 'Registrando...'
                    : `Registrar ${mesesSel.length > 0 ? `${mesesSel.length} mes${mesesSel.length > 1 ? 'es' : ''}` : 'meses'}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
