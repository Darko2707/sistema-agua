'use client';

import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Wallet,
  Building2,
  AlertTriangle,
  LogOut,
  Shield,
  Loader2,
} from 'lucide-react';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ahora = new Date();

interface Resumen {
  totalDeptos: number;
  pagados: number;
  recaudado: number;
  porCircuito: {
    nombre: string;
    total: number;
    pagados: number;
    recaudado: number;
  }[];
}

interface Personal {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ResidenteCompleto {
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
}

interface Circuito {
  id: string;
  nombre: string;
  representanteId: string | null;
}

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'representante', label: 'Representante' },
  { value: 'operador_pozo', label: 'Operador de pozo' },
  { value: 'cuadrilla_cortes', label: 'Cuadrilla' },
  { value: 'residente', label: 'Residente' },
];

function trpcQueryUrl(path: string) {
  return (
    `/api/trpc/${path}?batch=1&input=` +
    encodeURIComponent(JSON.stringify({ '0': { json: undefined } }))
  );
}

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
      return { label: estado || 'Desconocido', variant: 'outline' };
  }
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [tab, setTab] = useState<'resumen' | 'personal' | 'residentes' | 'pendientes'>('resumen');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [residentes, setResidentes] = useState<ResidenteCompleto[]>([]);
  const [circuitos, setCircuitos] = useState<Circuito[]>([]);
  const [pendientesCorte, setPendientesCorte] = useState<ResidenteCompleto[]>([]);
  const [pendientesReconexion, setPendientesReconexion] = useState<ResidenteCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [filtroCircuito, setFiltroCircuito] = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [error, setError] = useState<string | null>(null);

  async function cargarDatos() {
    try {
      const [resR, resP, resL, resC, resPC, resPR] = await Promise.all([
        fetch(trpcQueryUrl('pagos.resumenMes')),
        fetch(trpcQueryUrl('usuarios.listarPersonal')),
        fetch(trpcQueryUrl('usuarios.listarResidentes')),
        fetch(trpcQueryUrl('usuarios.listarCircuitos')),
        fetch(trpcQueryUrl('cortes.pendientesDeCorte')),
        fetch(trpcQueryUrl('cortes.pendientesDeReconexion')),
      ]);

      if (resR.ok) setResumen((await resR.json())?.[0]?.result?.data ?? null);
      if (resP.ok) setPersonal((await resP.json())?.[0]?.result?.data ?? []);
      if (resL.ok) setResidentes((await resL.json())?.[0]?.result?.data ?? []);
      if (resC.ok) setCircuitos((await resC.json())?.[0]?.result?.data ?? []);
      if (resPC.ok) setPendientesCorte((await resPC.json())?.[0]?.result?.data ?? []);
      if (resPR.ok) setPendientesReconexion((await resPR.json())?.[0]?.result?.data ?? []);
    } catch (err) {
      console.error(err);
      setError('Error al sincronizar datos con el servidor');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cambiarRol(userId: string, rol: string) {
    if (!userId) {
      setError('No se puede cambiar rol: usuario ID no válido');
      return;
    }
    
    setActualizando(userId);
    setError(null);
    
    try {
      const res = await fetch('/api/trpc/usuarios.cambiarRol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, rol }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Error al cambiar rol');
      }
      await cargarDatos();
    } catch (err: any) {
      setError(err.message || 'Error al cambiar rol');
    } finally {
      setActualizando(null);
    }
  }

  async function asignarRepresentante(circuitoId: string, userId: string) {
    setActualizando(circuitoId);
    setError(null);
    
    try {
      const res = await fetch('/api/trpc/usuarios.asignarRepresentante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitoId, userId: userId || null }),
      });
      
      if (res.ok) {
        await cargarDatos();
      } else {
        const errorData = await res.json();
        throw new Error(errorData?.error?.message || 'Error al asignar representante');
      }
    } catch (err: any) {
      setError(err.message || 'Error al asignar representante');
    } finally {
      setActualizando(null);
    }
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  const residentesFiltrados = residentes.filter((r) => {
    const porCircuito = filtroCircuito === 'todos' || r.circuito?.id === filtroCircuito;
    const porEstado = filtroEstado === 'todos' || r.estadoAgua === filtroEstado;
    return porCircuito && porEstado;
  });

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const morosos = resumen ? Math.max(0, resumen.totalDeptos - resumen.pagados) : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Panel Administrador</h1>
              <p className="mt-2 text-sky-100">
                {MESES[ahora.getMonth()]} {ahora.getFullYear()} · {session?.user?.name}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={salir} className="border-0">
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Pagos</p>
                <p className="text-3xl font-bold text-green-600">{resumen?.pagados ?? 0}</p>
              </div>
              <Wallet className="h-8 w-8 text-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Morosos</p>
                <p className="text-3xl font-bold text-red-600">{morosos}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Departamentos</p>
                <p className="text-3xl font-bold">{resumen?.totalDeptos ?? 0}</p>
              </div>
              <Building2 className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Recaudado</p>
                <p className="text-3xl font-bold text-sky-600">
                  ${(resumen?.recaudado ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <Users className="h-8 w-8 text-sky-600" />
            </CardContent>
          </Card>
        </div>

        {/* Error global */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2">
          <Button variant={tab === 'resumen' ? 'default' : 'outline'} onClick={() => setTab('resumen')}>
            Resumen
          </Button>
          <Button variant={tab === 'personal' ? 'default' : 'outline'} onClick={() => setTab('personal')}>
            Personal
          </Button>
          <Button variant={tab === 'residentes' ? 'default' : 'outline'} onClick={() => setTab('residentes')}>
            Residentes
          </Button>
          <Button variant={tab === 'pendientes' ? 'default' : 'outline'} onClick={() => setTab('pendientes')}>
            Pendientes ({pendientesCorte.length + pendientesReconexion.length})
          </Button>
          <Button variant="outline" onClick={() => router.push('/admin/circuitos')}>
            Configurar Circuitos
          </Button>
        </div>

        {/* Tab content: RESUMEN */}
        {tab === 'resumen' && (
          <Card>
            <CardHeader>
              <CardTitle>Estado de Cobranza por Circuito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {(resumen?.porCircuito ?? []).map((c) => {
                const pct = c.total > 0 ? Math.round((c.pagados / c.total) * 100) : 0;
                return (
                  <div key={c.nombre} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-muted-foreground font-semibold">
                        {c.pagados} / {c.total} cubiertos ({pct}%)
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      Recaudado: <span className="font-semibold text-green-700">
                        ${(c.recaudado ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Tab content: PERSONAL */}
        {tab === 'personal' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal del sistema</CardTitle>
                <p className="text-sm text-muted-foreground">Modifica privilegios y accesos del personal en tiempo real</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {personal.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">Sin personal asignado en la base de datos.</p>
                )}
                {personal.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between bg-white"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <p className="font-medium">{p.name || 'Usuario sin nombre'}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <Badge variant="outline" className="mt-1 capitalize">
                        {ROLES.find(r => r.value === p.role)?.label || p.role}
                      </Badge>
                    </div>
                    <select
                      value={p.role}
                      disabled={actualizando === p.id}
                      onChange={(e) => cambiarRol(p.id, e.target.value)}
                      className="h-10 rounded-lg border bg-background px-3 md:w-72 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Asignación de Circuitos</CardTitle>
                <p className="text-sm text-muted-foreground font-normal">Vincula un Representante o Administrador responsable por sector</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {circuitos.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between bg-white"
                  >
                    <div>
                      <p className="font-semibold text-base">{c.nombre}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.representanteId 
                          ? `Responsable: ${personal.find(p => p.id === c.representanteId)?.name || 'Cargando...'}` 
                          : 'Sin representante asignado'}
                      </p>
                    </div>
                    <select
                      onChange={(e) => asignarRepresentante(c.id, e.target.value)}
                      disabled={actualizando === c.id}
                      className="h-10 rounded-lg border bg-background px-3 md:w-72 text-sm shadow-sm focus:outline-none"
                      defaultValue={c.representanteId || ''}
                    >
                      <option value="">Dejar sin representante</option>
                      {personal
                        .filter((p) => p.role === 'representante' || p.role === 'admin')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.email})
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab content: RESIDENTES */}
        {tab === 'residentes' && (
          <Card>
            <CardHeader>
              <CardTitle>Padrón General de Residentes</CardTitle>
              <div className="flex flex-wrap gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Circuito:</label>
                  <select
                    value={filtroCircuito}
                    onChange={(e) => setFiltroCircuito(e.target.value)}
                    className="h-9 rounded-lg border bg-white px-3 text-sm focus:outline-none"
                  >
                    <option value="todos">Todos los circuitos</option>
                    {circuitos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Estado:</label>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="h-9 rounded-lg border bg-white px-3 text-sm focus:outline-none"
                  >
                    <option value="todos font-medium">Todos los estados</option>
                    <option value="activo">Activo</option>
                    <option value="pendiente_corte">Pendiente corte</option>
                    <option value="cortado">Cortado</option>
                    <option value="pendiente_reconexion">Pendiente reconexión</option>
                  </select>
                </div>

                {(filtroCircuito !== 'todos' || filtroEstado !== 'todos') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFiltroCircuito('todos');
                      setFiltroEstado('todos');
                    }}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {residentesFiltrados.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">Ningún residente coincide con los criterios de búsqueda.</p>
              ) : (
                residentesFiltrados.map((r) => {
                  const badgeInfo = getEstadoAguaLabel(r.estadoAgua);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between bg-white"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{r.usuario?.name || 'Residente no registrado'}</p>
                        <p className="text-xs text-muted-foreground">{r.usuario?.email}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm">
                          <span className="font-medium text-slate-600">
                            Edificio {r.edificio} - Depto {r.departamento}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-muted-foreground text-xs">{r.circuito?.nombre || 'Sin Sector'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 justify-between sm:justify-end border-t sm:border-0 pt-2 sm:pt-0">
                        <Badge variant={r.pagoEsteMes ? 'default' : 'outline'} className={r.pagoEsteMes ? 'bg-green-600 hover:bg-green-600' : ''}>
                          {r.pagoEsteMes ? 'Pagado' : 'Adeudo'}
                        </Badge>
                        <Badge variant={badgeInfo.variant}>
                          {badgeInfo.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab content: PENDIENTES */}
        {tab === 'pendientes' && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Cortes pendientes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-red-600 font-bold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Pendientes de Corte ({pendientesCorte.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendientesCorte.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No hay órdenes de corte en cola.</p>
                ) : (
                  pendientesCorte.map((p) => (
                    <div key={p.id} className="p-3 border rounded-xl bg-white flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{p.usuario?.name}</p>
                        <p className="text-xs text-muted-foreground">Edificio {p.edificio} - Depto {p.departamento}</p>
                      </div>
                      <Badge variant="destructive">Corte</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Reconexiones pendientes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-green-600 font-bold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Pendientes de Reconexión ({pendientesReconexion.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendientesReconexion.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No hay órdenes de reconexión pendientes.</p>
                ) : (
                  pendientesReconexion.map((p) => (
                    <div key={p.id} className="p-3 border rounded-xl bg-white flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{p.usuario?.name}</p>
                        <p className="text-xs text-muted-foreground">Edificio {p.edificio} - Depto {p.departamento}</p>
                      </div>
                      <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">Reconectar</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}