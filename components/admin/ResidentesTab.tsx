'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';
import { ROLES, type Circuito, type ResidenteCompleto } from '@/hooks/useAdmin';

const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ahora = new Date();
// Años disponibles: 3 años atrás hasta el actual
const ANIOS = Array.from({ length: 4 }, (_, i) => ahora.getFullYear() - 3 + i);

type Props = {
  residentesFiltrados:       ResidenteCompleto[];
  circuitos:                 Circuito[];
  filtroCircuito:            string;
  setFiltroCircuito:         (v: string) => void;
  filtroEstado:              string;
  setFiltroEstado:           (v: string) => void;
  actualizando:              string | null;
  onCambiarRol:              (userId: string, rol: string) => void;
  onRegistrarPagoRetroactivo: (perfilId: string, mes: number, anio: number, metodo: 'efectivo' | 'transferencia') => Promise<string>;
  onLimpiarFiltros:          () => void;
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
  const mesAnterior = ahora.getMonth() === 0 ? 12 : ahora.getMonth();
  const anioAnterior = ahora.getMonth() === 0 ? ahora.getFullYear() - 1 : ahora.getFullYear();

  const [modalResidente, setModalResidente] = useState<ResidenteCompleto | null>(null);
  const [mesSel,         setMesSel]         = useState(mesAnterior);
  const [anioSel,        setAnioSel]        = useState(anioAnterior);
  const [metodoSel,      setMetodoSel]      = useState<'efectivo' | 'transferencia'>('efectivo');
  const [registrando,    setRegistrando]    = useState(false);
  const [exito,          setExito]          = useState<string | null>(null);
  const [errorModal,     setErrorModal]     = useState<string | null>(null);

  function abrirModal(r: ResidenteCompleto) {
    setModalResidente(r);
    setMesSel(mesAnterior);
    setAnioSel(anioAnterior);
    setMetodoSel('efectivo');
    setExito(null);
    setErrorModal(null);
  }

  function cerrarModal() {
    if (registrando) return;
    setModalResidente(null);
    setExito(null);
    setErrorModal(null);
  }

  async function handleRegistrar() {
    if (!modalResidente) return;
    setRegistrando(true);
    setErrorModal(null);
    setExito(null);
    try {
      const folio = await onRegistrarPagoRetroactivo(modalResidente.id, mesSel, anioSel, metodoSel);
      setExito(`Pago registrado. Folio: ${folio}`);
    } catch (e: unknown) {
      setErrorModal(e instanceof Error ? e.message : 'Error al registrar el pago');
    } finally {
      setRegistrando(false);
    }
  }

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
                    + Pago anterior
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

      {/* ── Modal pago retroactivo ── */}
      {modalResidente && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">Registrar pago anterior</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {modalResidente.usuario?.name || 'Sin nombre'} ·{' '}
              {modalResidente.circuito?.nombre} · Edif. {modalResidente.edificio} · Depto. {modalResidente.departamento}
            </p>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Mes</label>
                  <select
                    value={mesSel}
                    onChange={(e) => setMesSel(Number(e.target.value))}
                    disabled={registrando || !!exito}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    {MESES_NOMBRE.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Año</label>
                  <select
                    value={anioSel}
                    onChange={(e) => setAnioSel(Number(e.target.value))}
                    disabled={registrando || !!exito}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    {ANIOS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Método de pago</label>
                <select
                  value={metodoSel}
                  onChange={(e) => setMetodoSel(e.target.value as 'efectivo' | 'transferencia')}
                  disabled={registrando || !!exito}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>

              {errorModal && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {errorModal}
                </div>
              )}

              {exito && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                  {exito}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={cerrarModal} disabled={registrando}>
                {exito ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!exito && (
                <Button onClick={handleRegistrar} disabled={registrando}>
                  {registrando ? 'Registrando...' : `Registrar ${MESES_NOMBRE[mesSel - 1]} ${anioSel}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
