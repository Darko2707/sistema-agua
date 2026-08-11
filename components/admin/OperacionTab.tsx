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
  accion: string;
  entidad: string;
  entidadId: string | null;
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
              <div key={row.id} className="rounded-lg border p-3 text-sm">
                <div className="font-semibold">{row.accion}</div>
                <div className="text-muted-foreground">{row.entidad} {row.entidadId ?? ''}</div>
              </div>
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
    </div>
  );
}
