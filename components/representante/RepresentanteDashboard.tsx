'use client';

import { useState, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useAuth';
import { useCircuitoActual } from '@/hooks/useCircuito';
import { usePagar } from '@/hooks/usePagos';
import { trpcReact } from '@/lib/trpc-react';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  LogOut, Users, AlertTriangle, TrendingUp, Droplets, Home,
  Banknote, Search, Loader2, DollarSign, Shield,
} from 'lucide-react';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Roles que el representante puede asignar dentro de su circuito
const ROLES_CIRCUITO = [
  { value: 'residente', label: 'Residente' },
  { value: 'tesorera',  label: 'Tesorero/a' },
];

export function RepresentanteDashboard() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [tab, setTab]               = useState<'todos' | 'morosos' | 'personal'>('todos');
  const [busqueda, setBusqueda]     = useState('');
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [mensaje, setMensaje]       = useState('');
  const [error, setError]           = useState('');

  const circuitoQuery   = useCircuitoActual();
  const resumenQuery    = trpcReact.pagos.resumenMes.useQuery();
  const residentesQuery = trpcReact.usuarios.listarResidentes.useQuery();
  const personalQuery   = trpcReact.usuarios.listarPersonal.useQuery();
  const pagarMutation   = usePagar();
  const cambiarRolMut   = trpcReact.usuarios.cambiarRolEnCircuito.useMutation();

  const circuito   = circuitoQuery.data;
  const resumen    = resumenQuery.data;
  const residentes = residentesQuery.data ?? [];
  const personal   = personalQuery.data ?? [];
  const cargando   = sessionPending || circuitoQuery.isLoading || resumenQuery.isLoading || residentesQuery.isLoading;
  const queryError = circuitoQuery.error?.message ?? resumenQuery.error?.message ?? residentesQuery.error?.message ?? null;

  async function registrarPagoManual(perfilId: string, metodo: 'efectivo' | 'transferencia') {
    setRegistrando(`${perfilId}:${metodo}`);
    setMensaje('');
    setError('');
    try {
      const result = await pagarMutation.mutateAsync({ perfilId, metodo });
      setMensaje(`Pago registrado con folio ${result.folio}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago');
    } finally {
      setRegistrando(null);
    }
  }

  async function cambiarRol(userId: string, rol: string) {
    setActualizando(userId);
    setError('');
    setMensaje('');
    try {
      await cambiarRolMut.mutateAsync({
        userId,
        rol: rol as 'residente' | 'tesorera',  // zod enum en el servidor lo valida
      });
      setMensaje('Rol actualizado correctamente');
      void residentesQuery.refetch();
      void personalQuery.refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol');
    } finally {
      setActualizando(null);
    }
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  const listaMostrar = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const filtrados = term
      ? residentes.filter(r => `${r.usuario.name} ${r.usuario.email} ${r.edificio} ${r.departamento}`.toLowerCase().includes(term))
      : residentes;
    return tab === 'morosos' ? filtrados.filter(r => !r.pagoEsteMes) : filtrados;
  }, [residentes, busqueda, tab]);

  if (cargando) {
    return <div className="min-h-screen flex flex-col gap-2 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /><p className="text-sm text-muted-foreground">Cargando datos...</p></div>;
  }

  const ahora      = new Date();
  const morosos    = resumen ? resumen.totalDeptos - resumen.pagados : 0;
  const porcentaje = resumen && resumen.totalDeptos > 0 ? Math.round((resumen.pagados / resumen.totalDeptos) * 100) : 0;
  const recaudado  = resumen?.recaudado ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                Circuito {circuito?.nombre ?? 'Asignado'}
              </span>
              <h1 className="text-3xl font-bold mt-2">Panel de Administración</h1>
              <p className="mt-1 text-sky-100 text-sm">{MESES[ahora.getMonth()]} {ahora.getFullYear()} · Representante: {session?.user?.name}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => router.push('/residente')} className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0">
                <Home className="mr-2 h-4 w-4" />Mi cuenta
              </Button>
              <Button variant="secondary" onClick={salir}><LogOut className="mr-2 h-4 w-4" />Salir</Button>
            </div>
          </div>
        </div>

        {queryError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{queryError}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Departamentos', value: resumen?.totalDeptos ?? 0, icon: <Users className="h-8 w-8 text-primary" />, color: '' },
            { label: 'Pagados', value: resumen?.pagados ?? 0, icon: <TrendingUp className="h-8 w-8 text-green-600" />, color: 'text-green-600' },
            { label: 'Morosos', value: morosos, icon: <AlertTriangle className="h-8 w-8 text-red-600" />, color: 'text-red-600' },
          ].map(({ label, value, icon, color }) => (
            <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground font-medium">{label}</p><p className={`text-3xl font-bold ${color}`}>{value}</p></div>{icon}</CardContent></Card>
          ))}
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground font-medium">Recaudado</p><p className="text-3xl font-bold text-amber-600">${recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></div><DollarSign className="h-8 w-8 text-amber-600" /></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3 items-start">
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-lg font-semibold">Avance de cobranza</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 flex justify-between text-sm"><span className="text-muted-foreground">Pagos recibidos</span><span className="font-semibold">{resumen?.pagados ?? 0}/{resumen?.totalDeptos ?? 0}</span></div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100 border"><div className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out" style={{ width: `${porcentaje}%` }} /></div>
              <p className="text-xs text-muted-foreground text-right mt-2">Recaudado: <span className="font-semibold text-green-700">${recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg font-semibold">Configuración de Cuotas</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Mensualidad:</span><span className="font-bold text-slate-700">${circuito?.montoMensual ?? '0.00'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reconexión:</span><span className="font-bold text-red-600">${circuito?.montoReconexion ?? '0.00'}</span></div>
            </CardContent>
          </Card>
        </div>

        {(mensaje || error) && (
          <div className={`rounded-xl border p-4 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'}`}>
            {error || mensaje}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <Button variant={tab === 'todos'    ? 'default' : 'outline'} onClick={() => setTab('todos')}>
            Todos ({residentes.length})
          </Button>
          <Button variant={tab === 'morosos'  ? 'destructive' : 'outline'} onClick={() => setTab('morosos')}>
            Morosos ({residentes.filter(r => !r.pagoEsteMes).length})
          </Button>
          <Button variant={tab === 'personal' ? 'default' : 'outline'} onClick={() => setTab('personal')}>
            Personal ({personal.length})
          </Button>
        </div>

        {/* ── Tab Personal ── */}
        {tab === 'personal' && (
          <Card>
            <CardHeader>
              <CardTitle>Personal del circuito</CardTitle>
              <p className="text-sm text-muted-foreground">Cambia el rol de los usuarios de tu circuito</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {personal.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">
                  No hay personal asignado a tu circuito. Cambia el rol de un residente a Tesorero/a desde la pestaña de residentes.
                </p>
              ) : (
                personal.map((p) => (
                  <div key={p.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <p className="font-medium">{p.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <Badge variant="outline" className="mt-1">
                        {ROLES_CIRCUITO.find(r => r.value === p.role)?.label ?? p.role}
                      </Badge>
                    </div>
                    <select
                      value={p.role}
                      disabled={actualizando === p.id}
                      onChange={e => cambiarRol(p.id, e.target.value)}
                      className="h-10 rounded-lg border bg-background px-3 md:w-56"
                    >
                      {ROLES_CIRCUITO.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Tabs de residentes ── */}
        {(tab === 'todos' || tab === 'morosos') && (
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-xl font-bold">{tab === 'morosos' ? 'Residentes morosos' : 'Todos los residentes'}</CardTitle>
                <div className="relative md:w-80">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar residente, correo o vivienda..." className="pl-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {listaMostrar.length === 0 && (
                <p className="py-10 text-center text-muted-foreground">{tab === 'morosos' ? 'Sin morosos este mes ✓' : 'No hay residentes que coincidan con la búsqueda'}</p>
              )}
              {listaMostrar.map(r => (
                <div key={r.id} className="rounded-xl border bg-background p-4 space-y-3 hover:border-slate-300 transition-colors">
                  {/* Fila superior: info + estado */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100">
                        <Droplets className="h-5 w-5 text-sky-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{r.usuario?.name}</p>
                        <p className="text-sm text-muted-foreground">Edif. {r.edificio} · Depto {r.departamento}</p>
                        <p className="text-xs text-slate-400">{r.usuario?.email}</p>
                        {r.tenencia === 'inquilino' && r.nombrePropietario && (
                          <p className="text-xs text-amber-700">
                            Inquilino · Dueño: {r.nombrePropietario}
                            {r.telefonoPropietario ? ` · ${r.telefonoPropietario}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <EstadoAguaBadge estado={r.estadoAgua} />
                      {r.estadoAgua === 'activo' && r.pagoEsteMes && <Badge className="font-medium bg-green-600">Pagado</Badge>}
                      {r.estadoAgua === 'activo' && r.esMoroso && !r.pagoEsteMes && <Badge variant="outline" className="border-amber-300 text-amber-600 font-medium">Moroso</Badge>}
                    </div>
                  </div>

                  {/* Fila inferior: rol + botones de pago */}
                  <div className="flex items-center justify-between gap-2 flex-wrap border-t pt-3">
                    {/* Selector de rol — siempre visible */}
                    <select
                      value={r.usuario?.role ?? 'residente'}
                      disabled={!r.usuario?.id || actualizando === r.usuario?.id}
                      onChange={e => { if (r.usuario?.id) void cambiarRol(r.usuario.id, e.target.value); }}
                      className="h-8 rounded-lg border bg-background px-2 text-sm w-36"
                    >
                      {ROLES_CIRCUITO.map(ro => (
                        <option key={ro.value} value={ro.value}>{ro.label}</option>
                      ))}
                    </select>

                    {/* Botones de pago */}
                    {r.estadoAgua === 'cortado' ? (
                      <div className="flex flex-col gap-1 items-end">
                        <p className="text-xs text-red-600 font-medium">
                          Reconexión ${Number(circuito?.montoReconexion ?? 0).toFixed(2)} + mes ${Number(circuito?.montoMensual ?? 0).toFixed(2)}
                        </p>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => registrarPagoManual(r.id, 'efectivo')} disabled={!!registrando} className="border-red-300 text-red-700">
                            {registrando === `${r.id}:efectivo` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1" />}
                            Efectivo
                          </Button>
                          <Button size="sm" onClick={() => registrarPagoManual(r.id, 'transferencia')} disabled={!!registrando} className="bg-red-600 hover:bg-red-700">
                            {registrando === `${r.id}:transferencia` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1" />}
                            Transf.
                          </Button>
                        </div>
                      </div>
                    ) : !r.pagoEsteMes ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => registrarPagoManual(r.id, 'efectivo')} disabled={!!registrando}>
                          {registrando === `${r.id}:efectivo` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1 text-emerald-600" />}
                          Efectivo
                        </Button>
                        <Button size="sm" onClick={() => registrarPagoManual(r.id, 'transferencia')} disabled={!!registrando}>
                          {registrando === `${r.id}:transferencia` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Banknote className="h-3 w-3 mr-1" />}
                          Transferencia
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-green-700 font-medium">Pago registrado este mes</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
