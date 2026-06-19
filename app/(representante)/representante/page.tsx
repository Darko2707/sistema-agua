'use client';

import { useState, useMemo, useEffect } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import {
  LogOut,
  Users,
  AlertTriangle,
  TrendingUp,
  Droplets,
  Home,
  Banknote,
  Search,
  Loader2,
  DollarSign,
} from 'lucide-react';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ahora = new Date();

type Circuito = {
  id: string;
  nombre: string;
  montoMensual: string;
  montoReconexion: string;
  activo: boolean;
};

type Resumen = {
  totalDeptos: number;
  pagados: number;
  recaudado: number;
  mes: number;
  anio: number;
  porCircuito: {
    nombre: string;
    total: number;
    pagados: number;
  }[];
};

type Residente = {
  id: string;
  edificio: string;
  departamento: string;
  estadoAgua: string;
  pagoEsteMes: boolean;
  esMoroso: boolean;
  corteActivo: boolean;
  usuario: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  circuito?: { id: string; nombre: string } | null;
};

function getEstadoAguaLabel(estado: string): { label: string; variant: 'default' | 'destructive' | 'outline' } {
  switch (estado) {
    case 'activo':
      return { label: 'Activo', variant: 'default' };
    case 'pendiente_corte':
      return { label: 'Pendiente corte', variant: 'destructive' };
    case 'cortado':
      return { label: 'Cortado', variant: 'destructive' };
    case 'pendiente_reconexion':
      return { label: 'Pendiente reconexión', variant: 'outline' };
    default:
      return { label: estado, variant: 'outline' };
  }
}

export default function RepresentantePage() {
  const router = useRouter();
  const { data: session, isPending: authPending } = useSession();

  // ✅ ESTADO vanilla (sin React Query)
  const [circuito, setCircuito] = useState<Circuito | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [residentes, setResidentes] = useState<Residente[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const [tab, setTab] = useState<'todos' | 'morosos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  // ✅ CARGAR DATOS con vanilla tRPC
  async function cargarDatos() {
    setCargandoDatos(true);
    setError('');
    try {
      const [c, r, res] = await Promise.all([
        trpc.circuitos.miCircuito.query(),
        trpc.pagos.resumenMes.query(),
        trpc.usuarios.listarResidentes.query(),
      ]);
      setCircuito(c);
      setResumen(r);
      setResidentes(res);
    } catch (e) {
      console.error(e);
      setError('Error al cargar los datos');
    } finally {
      setCargandoDatos(false);
    }
  }

  useEffect(() => {
    void cargarDatos();
  }, []);

  // ✅ REGISTRAR PAGO MANUAL con vanilla tRPC
  async function registrarPagoManual(perfilId: string, metodo: 'efectivo' | 'transferencia') {
    setRegistrando(`${perfilId}:${metodo}`);
    setMensaje('');
    setError('');
    try {
      const result = await trpc.pagos.registrarManual.mutate({ perfilId, metodo });
      setMensaje(`Pago registrado con folio ${result.folio}`);
      await cargarDatos();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el pago');
    } finally {
      setRegistrando(null);
    }
  }

  // ✅ SALIR
  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  // ✅ FILTRADO
  const listaMostrar = useMemo(() => {
    const normalizada = busqueda.trim().toLowerCase();

    let filtrados = residentes;
    if (normalizada) {
      filtrados = residentes.filter((r) => {
        const texto = `${r.usuario.name} ${r.usuario.email} ${r.edificio} ${r.departamento}`.toLowerCase();
        return texto.includes(normalizada);
      });
    }

    if (tab === 'morosos') {
      return filtrados.filter((r) => !r.pagoEsteMes);
    }

    return filtrados;
  }, [residentes, busqueda, tab]);

  // ✅ ESTADO DE CARGA
  if (authPending || cargandoDatos) {
    return (
      <div className="min-h-screen flex flex-col gap-2 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
        <p className="text-sm text-muted-foreground">Cargando datos...</p>
      </div>
    );
  }

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0;
  const porcentaje = resumen && resumen.totalDeptos > 0
    ? Math.round((resumen.pagados / resumen.totalDeptos) * 100)
    : 0;
  
  // ✅ RECAUDADO DEL CIRCUITO (del resumen general)
  const recaudadoCircuito = resumen?.recaudado ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                Circuito {circuito?.nombre || 'Asignado'}
              </span>
              <h1 className="text-3xl font-bold mt-2">Panel de Administración</h1>
              <p className="mt-1 text-sky-100 text-sm">
                {MESES[ahora.getMonth()]} {ahora.getFullYear()} · Representante: {session?.user?.name}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => router.push('/residente')}
                className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border-0"
              >
                <Home className="mr-2 h-4 w-4" />
                Mi cuenta
              </Button>
              <Button variant="secondary" onClick={salir}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>

        {/* Tarjetas de Métricas */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Departamentos</p>
                <p className="text-3xl font-bold">{resumen?.totalDeptos ?? 0}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Pagados</p>
                <p className="text-3xl font-bold text-green-600">{resumen?.pagados ?? 0}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Morosos</p>
                <p className="text-3xl font-bold text-red-600">{morosos}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Recaudado</p>
                <p className="text-3xl font-bold text-amber-600">
                  ${recaudadoCircuito.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-600" />
            </CardContent>
          </Card>
        </div>

        {/* Barra de progreso y cuotas */}
        <div className="grid gap-4 md:grid-cols-3 items-start">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Avance de cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Pagos recibidos</span>
                <span className="font-semibold">
                  {resumen?.pagados ?? 0}/{resumen?.totalDeptos ?? 0}
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100 border">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right mt-2">
                Recaudado: <span className="font-semibold text-green-700">
                  ${recaudadoCircuito.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Configuración de Cuotas</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Mensualidad:</span>
                <span className="font-bold text-slate-700">${circuito?.montoMensual || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reconexión:</span>
                <span className="font-bold text-red-600">${circuito?.montoReconexion || '0.00'}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-muted-foreground font-medium">Total recaudado:</span>
                <span className="font-bold text-amber-600">
                  ${recaudadoCircuito.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          <Button
            variant={tab === 'todos' ? 'default' : 'outline'}
            onClick={() => setTab('todos')}
          >
            Todos ({residentes.length})
          </Button>
          <Button
            variant={tab === 'morosos' ? 'destructive' : 'outline'}
            onClick={() => setTab('morosos')}
          >
            Morosos ({residentes.filter((r) => !r.pagoEsteMes).length})
          </Button>
        </div>

        {/* Mensajes de Feedback */}
        {(mensaje || error) && (
          <div className={`rounded-xl border p-4 text-sm font-medium transition-all ${
            error ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'
          }`}>
            {error || mensaje}
          </div>
        )}

        {/* Buscador y Lista */}
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-xl font-bold">
                {tab === 'morosos' ? 'Residentes morosos' : 'Todos los residentes'}
              </CardTitle>
              <div className="relative md:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar residente, correo o vivienda..."
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {listaMostrar.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                {tab === 'morosos' ? 'Sin morosos este mes ✓' : 'No hay residentes que coincidan con la búsqueda'}
              </p>
            )}

            {listaMostrar.map((r) => {
              const estadoInfo = getEstadoAguaLabel(r.estadoAgua);
              const isEfectivoLoading = registrando === `${r.id}:efectivo`;
              const isTransLoading = registrando === `${r.id}:transferencia`;

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-4 rounded-xl border bg-background p-4 md:flex-row md:items-center md:justify-between hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 border border-sky-100">
                      <Droplets className="h-6 w-6 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{r.usuario.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Edificio {r.edificio} · Depto {r.departamento}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.usuario.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant={r.pagoEsteMes ? 'default' : 'destructive'} className="font-medium">
                      {r.pagoEsteMes ? 'Pagado' : 'Sin pago'}
                    </Badge>
                    <Badge variant={estadoInfo.variant} className="font-medium">
                      {estadoInfo.label}
                    </Badge>
                    {r.corteActivo && (
                      <Badge variant="outline" className="border-red-200 bg-red-50/50 text-red-600 font-medium">
                        Corte automático
                      </Badge>
                    )}

                    {!r.pagoEsteMes && (
                      <div className="flex gap-1.5 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => registrarPagoManual(r.id, 'efectivo')}
                          disabled={!!registrando}
                          className="h-9"
                        >
                          {isEfectivoLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Banknote className="mr-2 h-4 w-4 text-emerald-600" />
                          )}
                          {isEfectivoLoading ? 'Guardando...' : 'Efectivo'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => registrarPagoManual(r.id, 'transferencia')}
                          disabled={!!registrando}
                          className="h-9"
                        >
                          {isTransLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Banknote className="mr-2 h-4 w-4" />
                          )}
                          {isTransLoading ? 'Guardando...' : 'Transferencia'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}