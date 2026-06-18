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
  Scissors,
  RotateCcw,
} from 'lucide-react';

const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const ahora = new Date();

type Resumen = {
  totalDeptos: number;
  pagados: number;
  recaudado: number;
  porCircuito: {
    nombre: string;
    total: number;
    pagados: number;
  }[];
};

type Personal = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ResidenteCompleto = {
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

type Circuito = {
  id: string;
  nombre: string;
  representanteId: string | null;
};

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
      return { label: estado, variant: 'outline' };
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

    setCargando(false);
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
    }
    setActualizando(null);
  }

  async function asignarRepresentante(circuitoId: string, userId: string) {
    if (!userId) return;
    setActualizando(circuitoId);
    
    try {
      const res = await fetch('/api/trpc/usuarios.asignarRepresentante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitoId, userId }),
      });
      
      if (res.ok) {
        await cargarDatos();
      } else {
        const errorData = await res.json();
        setError(errorData?.error?.message || 'Error al asignar representante');
      }
    } catch (err: any) {
      setError(err.message || 'Error al asignar representante');
    }
    setActualizando(null);
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  // Filtrar residentes
  const residentesFiltrados = residentes.filter((r) => {
    const porCircuito = filtroCircuito === 'todos' || r.circuito?.id === filtroCircuito;
    const porEstado = filtroEstado === 'todos' || r.estadoAgua === filtroEstado;
    return porCircuito && porEstado;
  });

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const morosos = resumen ? resumen.totalDeptos - resumen.pagados : 0;

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
              <Button variant="secondary" onClick={salir}>
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
                <p className="text-3xl font-bold">
                  ${(resumen?.recaudado ?? 0).toLocaleString()}
                </p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        </div>

        {/* Error global */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* Tabs */}
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
            Pendientes
          </Button>
          <Button variant="outline" onClick={() => router.push('/admin/circuitos')}>
            Circuitos
          </Button>
          <Button variant="outline" onClick={() => router.push('/admin/representantes')}>
            Representantes
          </Button>
        </div>

        {/* Resumen */}
        {tab === 'resumen' && (
          <Card>
            <CardHeader>
              <CardTitle>Estado por circuito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {(resumen?.porCircuito ?? []).map((c) => {
                const pct = c.total > 0 ? Math.round((c.pagados / c.total) * 100) : 0;
                return (
                  <div key={c.nombre} className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-muted-foreground">
                        {c.pagados}/{c.total}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Personal - Gestión de roles */}
        {tab === 'personal' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal del sistema</CardTitle>
                <p className="text-sm text-muted-foreground">Cambia el rol de los usuarios desde el selector</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {personal.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">Sin personal registrado.</p>
                )}
                {personal.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <p className="font-medium">{p.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <Badge variant="outline" className="mt-1">
                        {ROLES.find(r => r.value === p.role)?.label || p.role}
                      </Badge>
                    </div>
                    <select
                      value={p.role}
                      disabled={actualizando === p.id}
                      onChange={(e) => {
                        const userId = p.id;
                        if (!userId) {
                          setError('No se puede cambiar rol: usuario ID no válido');
                          return;
                        }
                        cambiarRol(userId, e.target.value);
                      }}
                      className="h-10 rounded-lg border bg-background px-3 md:w-72"
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
                <CardTitle>Circuitos y representantes</CardTitle>
                <p className="text-sm text-muted-foreground">Asigna un representante a cada circuito</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {circuitos.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{c.nombre}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.representanteId 
                          ? `Representante: ${personal.find(p => p.id === c.representanteId)?.name || 'Asignado'}` 
                          : 'Sin representante asignado'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <select
                        onChange={(e) => asignarRepresentante(c.id, e.target.value)}
                        disabled={actualizando === c.id}
                        className="h-10 rounded-lg border bg-background px-3 md:w-64"
                        defaultValue={c.representanteId || ''}
                      >
                        <option value="">Sin representante</option>
                        {personal
                          .filter((p) => p.role === 'representante' || p.role === 'admin')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.email})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Residentes con filtros y cambio de rol */}
        {tab === 'residentes' && (
          <Card>
            <CardHeader>
              <CardTitle>Todos los residentes</CardTitle>
              <div className="flex flex-wrap gap-4 mt-2">
                {/* Filtro por circuito */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Circuito:</label>
                  <select
                    value={filtroCircuito}
                    onChange={(e) => setFiltroCircuito(e.target.value)}
                    className="h-9 rounded-lg border bg-background px-3 text-sm"
                  >
                    <option value="todos">Todos</option>
                    {circuitos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro por estado */}
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

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFiltroCircuito('todos');
                    setFiltroEstado('todos');
                  }}
                >
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
                const estadoInfo = getEstadoAguaLabel(r.estadoAgua);
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
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={r.pagoEsteMes ? 'default' : 'destructive'}>
                        {r.pagoEsteMes ? 'Pagado' : 'Sin pago'}
                      </Badge>
                      <Badge variant={estadoInfo.variant}>{estadoInfo.label}</Badge>
                      {r.esMoroso && !r.corteActivo && (
                        <Badge variant="outline" className="border-amber-300 text-amber-600">
                          Moroso
                        </Badge>
                      )}
                      {r.corteActivo && (
                        <Badge variant="outline" className="border-red-300 text-red-600">
                          Corte activo
                        </Badge>
                      )}
                    </div>

                    {/* Selector de rol para residentes */}
                    <div className="flex items-center gap-2">
                      <select
                        value={r.usuario?.role || 'residente'}
                        disabled={actualizando === r.id}
                        onChange={(e) => {
                          if (!usuarioId) {
                            setError('No se puede cambiar rol: usuario ID no válido');
                            return;
                          }
                          cambiarRol(usuarioId, e.target.value);
                        }}
                        className="h-9 rounded-lg border bg-background px-2 text-sm md:w-40"
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
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
        )}

        {/* Pendientes */}
        {tab === 'pendientes' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-red-600" />
                  Pendientes de corte
                </CardTitle>
                <Badge variant="destructive">{pendientesCorte.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendientesCorte.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground">Sin pendientes de corte</p>
                )}
                {pendientesCorte.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                      </p>
                      <Badge variant="destructive">Pendiente de corte</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Debe el mes - esperando cuadrilla</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-amber-600" />
                  Pendientes de reconexión
                </CardTitle>
                <Badge variant="outline" className="border-amber-300 text-amber-600">
                  {pendientesReconexion.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendientesReconexion.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground">Sin reconexiones pendientes</p>
                )}
                {pendientesReconexion.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">{r.usuario?.name || 'Sin nombre'}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.circuito?.nombre || 'Sin circuito'} · {r.edificio} · {r.departamento}
                      </p>
                      <Badge variant="outline" className="border-amber-300 text-amber-600">
                        Pendiente reconexión
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Pagó reconexión - esperando cuadrilla</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}