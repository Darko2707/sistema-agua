'use client';

import { useState, useMemo } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';

import { Button }   from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge }    from '@/components/ui/badge';
import { Input }    from '@/components/ui/input';
import { Banknote, Search, Loader2, Droplets, CheckCircle2 } from 'lucide-react';

import { MESES_CORTO as MESES } from '@/lib/meses';

type Filtro = 'todos' | 'pendientes';

export function PagosTesorera() {
  const [filtro,    setFiltro]    = useState<Filtro>('pendientes');
  const [busqueda,  setBusqueda]  = useState('');
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);

  const utils = trpcReact.useUtils();
  const query = trpcReact.pagos.listarResidentesParaPago.useQuery();
  const mutation = trpcReact.pagos.registrarManualTesorera.useMutation({
    onSuccess: () => {
      void utils.pagos.listarResidentesParaPago.invalidate();
      void utils.reportes.reporteFinanciero.invalidate();
    },
  });

  const circuito   = query.data?.circuito;
  const residentes = query.data?.residentes ?? [];
  const cargando   = query.isLoading;

  const ahora = new Date();

  async function registrar(perfilId: string, metodo: 'efectivo' | 'transferencia') {
    setRegistrando(`${perfilId}:${metodo}`);
    try {
      const res = await mutation.mutateAsync({ perfilId, metodo });
      mostrar(`Pago registrado — folio ${res.folio}`, 'ok');
    } catch (e: unknown) {
      mostrar(e instanceof Error ? e.message : 'No se pudo registrar el pago', 'error');
    } finally {
      setRegistrando(null);
    }
  }

  function mostrar(msg: string, tipo: 'ok' | 'error') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  const lista = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const base = term
      ? residentes.filter(r =>
          `${r.usuario?.name} ${r.usuario?.email} ${r.edificio} ${r.departamento}`.toLowerCase().includes(term),
        )
      : residentes;
    return filtro === 'pendientes' ? base.filter(r => !r.pagoEsteMes) : base;
  }, [residentes, busqueda, filtro]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!circuito) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-700">
        No tienes un circuito asignado. Contacta al administrador.
      </div>
    );
  }

  const pagados   = residentes.filter(r => r.pagoEsteMes).length;
  const pendientes = residentes.length - pagados;

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Encabezado del circuito */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Circuito</p>
              <p className="text-lg font-bold">{circuito.nombre}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {MESES[ahora.getMonth()]} {ahora.getFullYear()} · Cuota: ${circuito.montoMensual} · Reconexión: ${circuito.montoReconexion}
              </p>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{pagados}</p>
                <p className="text-xs text-muted-foreground">Pagados</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{pendientes}</p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{residentes.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros y buscador */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filtro === 'pendientes' ? 'default' : 'outline'}
            onClick={() => setFiltro('pendientes')}
          >
            Pendientes ({pendientes})
          </Button>
          <Button
            size="sm"
            variant={filtro === 'todos' ? 'default' : 'outline'}
            onClick={() => setFiltro('todos')}
          >
            Todos ({residentes.length})
          </Button>
        </div>
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar residente o vivienda..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Lista de residentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtro === 'pendientes' ? 'Residentes con pago pendiente' : 'Todos los residentes'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
              <p className="font-medium text-green-700">
                {filtro === 'pendientes' ? '¡Todos al corriente este mes!' : 'Sin resultados'}
              </p>
            </div>
          )}

          {lista.map(r => (
            <div
              key={r.id}
              className="rounded-xl border bg-background p-4 space-y-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100">
                    <Droplets className="h-5 w-5 text-sky-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{r.usuario?.name}</p>
                    <p className="text-sm text-muted-foreground">Edif. {r.edificio} · Depto {r.departamento}</p>
                    <p className="text-xs text-slate-400">{r.usuario?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <EstadoAguaBadge estado={r.estadoAgua} />
                  {r.pagoEsteMes && <Badge className="bg-green-600">Pagado</Badge>}
                </div>
              </div>

              {!r.pagoEsteMes && (
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  {r.estadoAgua === 'cortado' && (
                    <p className="text-xs text-red-600 font-medium">
                      Reconexión ${Number(circuito.montoReconexion).toFixed(2)} + mes ${Number(circuito.montoMensual).toFixed(2)}
                    </p>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!registrando}
                      onClick={() => registrar(r.id, 'efectivo')}
                      className={r.estadoAgua === 'cortado' ? 'border-red-300 text-red-700' : ''}
                    >
                      {registrando === `${r.id}:efectivo`
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <Banknote className="h-3 w-3 mr-1" />}
                      Efectivo
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!registrando}
                      onClick={() => registrar(r.id, 'transferencia')}
                      className={r.estadoAgua === 'cortado' ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                      {registrando === `${r.id}:transferencia`
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <Banknote className="h-3 w-3 mr-1" />}
                      Transferencia
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
