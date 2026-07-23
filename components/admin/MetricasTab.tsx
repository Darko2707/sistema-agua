'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, Droplets, RefreshCw } from 'lucide-react';
import { MESES_CORTO } from '@/lib/meses';
import type { MetricasAdmin } from '@/src/application/ports/pago.repository';

// ── SVG Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 300;
  const H = 48;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (v / max) * H * 0.9;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-14 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        className="stroke-sky-500"
      />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

const ahora = new Date();

export function MetricasTab() {
  const [mes,      setMes]      = useState(ahora.getMonth() + 1);
  const [anio,     setAnio]     = useState(ahora.getFullYear());
  const [data,     setData]     = useState<MetricasAdmin | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const anios = Array.from({ length: 5 }, (_, i) => ahora.getFullYear() - i);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const result = await trpc.pagos.metricasAdmin.query({ mes, anio });
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar métricas');
    } finally {
      setCargando(false);
    }
  }, [mes, anio]);

  useEffect(() => {
    // Carga de métricas al montar/cambiar período; no hay estado externo que sincronizar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Período:</span>
        <select
          aria-label="Mes"
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          {MESES_CORTO.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Año"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          {anios.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {cargando && (
        <div role="status" aria-label="Cargando métricas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error al cargar métricas: {error}
        </div>
      )}

      {!cargando && data && (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recaudado {MESES_CORTO[mes - 1]}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-green-600">
                    ${data.revenueMes.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 shrink-0 text-green-500" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagados / Total</p>
                  <p className="mt-1 text-2xl font-bold">
                    {data.totalPagadosMes}
                    <span className="text-base font-normal text-muted-foreground"> / {data.totalResidentes}</span>
                  </p>
                </div>
                <Droplets className="h-6 w-6 shrink-0 text-sky-500" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Morosidad</p>
                  <p className={`mt-1 text-2xl font-bold ${
                    data.morosidadPct > 30 ? 'text-red-600'
                    : data.morosidadPct > 15 ? 'text-amber-600'
                    : 'text-green-600'
                  }`}>
                    {data.morosidadPct}%
                  </p>
                </div>
                <AlertTriangle className={`h-6 w-6 shrink-0 ${data.morosidadPct > 30 ? 'text-red-500' : 'text-amber-500'}`} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reconexiones</p>
                  <p className="mt-1 text-2xl font-bold text-violet-600">{data.reconexionesMes}</p>
                </div>
                <RefreshCw className="h-6 w-6 shrink-0 text-violet-500" />
              </CardContent>
            </Card>
          </div>

          {/* Sparkline — last 30 days */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pagos diarios — últimos 30 días</CardTitle>
            </CardHeader>
            <CardContent>
              {data.pagosPorDia.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin pagos en los últimos 30 días.
                </p>
              ) : (
                <div className="space-y-3">
                  <Sparkline data={data.pagosPorDia.map((d) => d.cantidad)} />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Fecha</th>
                          <th className="pb-2 pr-4 text-right font-medium">Pagos</th>
                          <th className="pb-2 text-right font-medium">Monto base</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.pagosPorDia].reverse().map((d) => (
                          <tr key={d.fecha} className="border-b last:border-0">
                            <td className="py-1.5 pr-4 text-muted-foreground">{d.fecha}</td>
                            <td className="py-1.5 pr-4 text-right font-medium">{d.cantidad}</td>
                            <td className="py-1.5 text-right">
                              ${d.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
