'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Ejecutivo = {
  ingresosMes: number;
  residentesActivos: number;
  pagosMes: number;
  morosidadPct: number;
  cortesPendientes: number;
  reconexionesPendientes: number;
  pagosPorMetodo: { efectivo: number; transferencia: number; mercadoPago: number };
};

type AuditoriaRow = {
  id: string;
  actorId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle?: Record<string, unknown> | null;
  creadoEn: string | Date;
};

type NotificacionRow = {
  id: string;
  tipo: string;
  canal: string;
  estado: string;
  creadoEn: string | Date;
};

async function obtenerOperacion() {
  const [dashboard, auditoria, notificaciones] = await Promise.all([
    trpc.operacion.dashboardEjecutivo.query(),
    trpc.operacion.auditoria.query({ limit: 10 }),
    trpc.operacion.notificaciones.query({ limit: 10 }),
  ]);
  return { dashboard, auditoria, notificaciones };
}

export function OperacionTab() {
  const [dashboard, setDashboard] = useState<Ejecutivo | null>(null);
  const [auditoria, setAuditoria] = useState<AuditoriaRow[]>([]);
  const [notificaciones, setNotificaciones] = useState<NotificacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditoriaSeleccionada, setAuditoriaSeleccionada] = useState<AuditoriaRow | null>(null);

  async function cargar() {
    setLoading(true);
    setError('');
    try {
      const data = await obtenerOperacion();
      setDashboard(data.dashboard as Ejecutivo);
      setAuditoria(data.auditoria as AuditoriaRow[]);
      setNotificaciones(data.notificaciones as NotificacionRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar operacion');
    } finally {
      setLoading(false);
    }
  }

  async function exportar() {
    const data = await trpc.operacion.exportacionCompleta.query();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-sis4s-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let active = true;
    void obtenerOperacion()
      .then((data) => {
        if (!active) return;
        setDashboard(data.dashboard as Ejecutivo);
        setAuditoria(data.auditoria as AuditoriaRow[]);
        setNotificaciones(data.notificaciones as NotificacionRow[]);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar operacion');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Cargando operacion...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Operacion</h2>
          <p className="text-sm text-muted-foreground">Auditoria, notificaciones, respaldo y resumen ejecutivo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={exportar}>
            <Download className="mr-2 h-4 w-4" />
            Exportar respaldo
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {dashboard && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Ingresos del mes</p><p className="text-2xl font-bold">${dashboard.ingresosMes.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Morosidad</p><p className="text-2xl font-bold">{dashboard.morosidadPct}%</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pagos del mes</p><p className="text-2xl font-bold">{dashboard.pagosMes}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cortes pendientes</p><p className="text-2xl font-bold">{dashboard.cortesPendientes}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Reconexiones pendientes</p><p className="text-2xl font-bold">{dashboard.reconexionesPendientes}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Metodos</p><p className="text-sm font-semibold">Efectivo {dashboard.pagosPorMetodo.efectivo} · Transferencia {dashboard.pagosPorMetodo.transferencia} · Tarjeta {dashboard.pagosPorMetodo.mercadoPago}</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Auditoria reciente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {auditoria.length === 0 ? <p className="text-sm text-muted-foreground">Sin eventos.</p> : auditoria.map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => setAuditoriaSeleccionada(row)}
                className="w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="font-semibold">{row.accion}</div>
                <div className="text-muted-foreground">{row.entidad} {row.entidadId ?? ''}</div>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(row.creadoEn).toLocaleString('es-MX')}</div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notificaciones</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notificaciones.length === 0 ? <p className="text-sm text-muted-foreground">Sin notificaciones.</p> : notificaciones.map(row => (
              <div key={row.id} className="rounded-lg border p-3 text-sm">
                <div className="font-semibold">{row.tipo} · {row.estado}</div>
                <div className="text-muted-foreground">Canal: {row.canal}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {auditoriaSeleccionada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAuditoriaSeleccionada(null);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Detalle de auditoria</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(auditoriaSeleccionada.creadoEn).toLocaleString('es-MX')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAuditoriaSeleccionada(null)}>
                Cerrar
              </Button>
            </div>

            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="font-medium text-muted-foreground">Accion</dt>
                <dd className="font-semibold">{auditoriaSeleccionada.accion}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Entidad</dt>
                <dd>{auditoriaSeleccionada.entidad}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">ID entidad</dt>
                <dd className="break-all">{auditoriaSeleccionada.entidadId ?? 'Sin entidad'}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Actor</dt>
                <dd className="break-all">{auditoriaSeleccionada.actorId ?? 'Sistema'}</dd>
              </div>
            </dl>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Detalle</p>
              <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs">
                {JSON.stringify(auditoriaSeleccionada.detalle ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
