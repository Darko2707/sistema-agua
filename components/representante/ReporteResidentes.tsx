'use client';

import { useState, useMemo } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import { FileDown, Search, Filter, Loader2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoAgua = 'activo' | 'pendiente_corte' | 'cortado' | 'pendiente_reconexion';
type OrdenResidentes = 'edificio' | 'nombre' | 'estado';

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const ETIQUETA_ESTADO: Record<EstadoAgua, string> = {
  activo:               'Activo',
  pendiente_corte:      'Pte. Corte',
  cortado:              'Cortado',
  pendiente_reconexion: 'Pte. Reconex.',
};

const VARIANTE_ESTADO: Record<EstadoAgua, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  activo:               'default',
  pendiente_corte:      'secondary',
  cortado:              'destructive',
  pendiente_reconexion: 'outline',
};

function mxn(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-slate-200 rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-lg" />
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReporteResidentes() {
  const [estadoFiltro,  setEstadoFiltro]  = useState<EstadoAgua | ''>('');
  const [edificioFiltro, setEdificioFiltro] = useState('');
  const [busqueda,       setBusqueda]       = useState('');
  const [orden,          setOrden]          = useState<OrdenResidentes>('edificio');
  const [descargando,    setDescargando]    = useState(false);

  const edificiosQuery = trpcReact.reportes.edificiosCircuito.useQuery();
  const residentesQuery = trpcReact.reportes.reporteResidentes.useQuery({
    estadoAgua: estadoFiltro || undefined,
    edificio:   edificioFiltro || undefined,
    busqueda:   busqueda || undefined,
    orden,
  });

  const residentes  = residentesQuery.data ?? [];
  const edificios   = edificiosQuery.data ?? [];
  const cargando    = residentesQuery.isLoading;
  const error       = residentesQuery.error?.message;

  // Calcular los periodos desde el primer residente (todos comparten los mismos 12 meses)
  const periodos = useMemo(() => residentes[0]?.pagosAnio ?? [], [residentes]);

  async function exportarExcel() {
    setDescargando(true);
    try {
      const params = new URLSearchParams();
      if (estadoFiltro)   params.set('estadoAgua', estadoFiltro);
      if (edificioFiltro) params.set('edificio', edificioFiltro);
      params.set('orden', orden);

      const res  = await fetch(`/api/reportes/residentes?${params}`);
      if (!res.ok) throw new Error('Error al generar Excel');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'reporte-residentes.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo generar el Excel. Intenta nuevamente.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
            {/* Búsqueda */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar nombre o departamento…"
                className="pl-9"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>

            {/* Filtro estado */}
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={estadoFiltro}
              onChange={e => setEstadoFiltro(e.target.value as EstadoAgua | '')}
            >
              <option value="">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="pendiente_corte">Pendiente de corte</option>
              <option value="cortado">Cortado</option>
              <option value="pendiente_reconexion">Pendiente de reconexión</option>
            </select>

            {/* Filtro edificio */}
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={edificioFiltro}
              onChange={e => setEdificioFiltro(e.target.value)}
            >
              <option value="">Todos los edificios</option>
              {edificios.map(ed => <option key={ed} value={ed}>{ed}</option>)}
            </select>

            {/* Orden */}
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={orden}
              onChange={e => setOrden(e.target.value as OrdenResidentes)}
            >
              <option value="edificio">Ordenar: Edificio/Depto</option>
              <option value="nombre">Ordenar: Nombre</option>
              <option value="estado">Ordenar: Estado</option>
            </select>

            {/* Exportar */}
            <Button onClick={exportarExcel} disabled={descargando || cargando} variant="outline" className="gap-2">
              {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen rápido */}
      {!cargando && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="font-medium">{residentes.length}</span> residentes
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm text-green-700">
            {residentes.filter(r => r.estadoAgua === 'activo').length} activos
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm text-red-700">
            {residentes.filter(r => r.estadoAgua === 'cortado').length} cortados
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
            {residentes.filter(r => r.estadoAgua === 'pendiente_corte').length} pte. corte
          </div>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Residentes del circuito</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {cargando ? (
            <div className="p-4"><Skeleton /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Edif.</TableHead>
                  <TableHead>Depto</TableHead>
                  <TableHead>Estado</TableHead>
                  {periodos.map(p => (
                    <TableHead key={`${p.mes}-${p.anio}`} className="text-center px-1 text-xs whitespace-nowrap">
                      {MESES_CORTOS[p.mes - 1]}<br />
                      <span className="text-[10px] text-muted-foreground">{String(p.anio).slice(2)}</span>
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap">Total 12m</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Sin pagar</TableHead>
                  <TableHead className="whitespace-nowrap">Último pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {residentes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10 + periodos.length} className="py-12 text-center text-muted-foreground">
                      No se encontraron residentes con los filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
                {residentes.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-nowrap">{r.nombre}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.telefono}</TableCell>
                    <TableCell>{r.edificio}</TableCell>
                    <TableCell>{r.departamento}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_ESTADO[r.estadoAgua as EstadoAgua] ?? 'outline'} className="text-xs">
                        {ETIQUETA_ESTADO[r.estadoAgua as EstadoAgua] ?? r.estadoAgua}
                      </Badge>
                    </TableCell>
                    {r.pagosAnio.map(p => (
                      <TableCell key={`${p.mes}-${p.anio}`} className="text-center px-1">
                        {p.estado === 'pagado' ? (
                          <span className="text-green-600 font-bold text-sm">✓</span>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium text-green-700 whitespace-nowrap">
                      {mxn(r.totalPagado)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={r.mesesSinPagar === 0 ? 'text-green-600 font-medium' : r.mesesSinPagar > 2 ? 'text-red-600 font-bold' : 'text-amber-600 font-medium'}>
                        {r.mesesSinPagar}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.ultimoPago
                        ? new Date(r.ultimoPago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
