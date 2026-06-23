'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  Building2,
  LogOut,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

import { useAdmin, MESES } from '@/hooks/useAdmin';
import { ResumenTab }    from './ResumenTab';
import { PersonalTab }   from './PersonalTab';
import { ResidentesTab } from './ResidentesTab';
import { PendientesTab } from './PendientesTab';

const ahora = new Date();

export function AdminDashboard() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const {
    tab, setTab,
    resumen,
    personal,
    circuitos,
    pendientesCorte,
    pendientesReconexion,
    cargando,
    actualizando,
    filtroCircuito, setFiltroCircuito,
    filtroEstado,   setFiltroEstado,
    error,
    residentesFiltrados,
    morosos,
    cambiarRol,
    asignarRepresentante,
    registrarPagoRetroactivo,
    salir,
  } = useAdmin();

  if (isPending || cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

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
            <Button variant="secondary" onClick={salir}>
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
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

        {/* Navegación de tabs */}
        <div className="flex flex-wrap gap-2">
          {(['resumen', 'personal', 'residentes', 'pendientes'] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? 'default' : 'outline'}
              onClick={() => setTab(t)}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
          <Button variant="outline" onClick={() => router.push('/admin/circuitos')}>
            Circuitos
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => router.push('/admin/representantes')}
          >
            <UserCog className="h-4 w-4" />
            Representantes
          </Button>
        </div>

        {/* Paneles */}
        {tab === 'resumen' && (
          <ResumenTab porCircuito={resumen?.porCircuito ?? []} />
        )}
        {tab === 'personal' && (
          <PersonalTab
            personal={personal}
            circuitos={circuitos}
            actualizando={actualizando}
            onCambiarRol={cambiarRol}
            onAsignarRepresentante={asignarRepresentante}
          />
        )}
        {tab === 'residentes' && (
          <ResidentesTab
            residentesFiltrados={residentesFiltrados}
            circuitos={circuitos}
            filtroCircuito={filtroCircuito}
            setFiltroCircuito={setFiltroCircuito}
            filtroEstado={filtroEstado}
            setFiltroEstado={setFiltroEstado}
            actualizando={actualizando}
            onCambiarRol={cambiarRol}
            onRegistrarPagoRetroactivo={registrarPagoRetroactivo}
            onLimpiarFiltros={() => {
              setFiltroCircuito('todos');
              setFiltroEstado('todos');
            }}
          />
        )}
        {tab === 'pendientes' && (
          <PendientesTab
            pendientesCorte={pendientesCorte}
            pendientesReconexion={pendientesReconexion}
          />
        )}
      </div>
    </div>
  );
}
