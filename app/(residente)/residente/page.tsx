'use client';

import { useEffect, useState } from 'react';
import { authClient, useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  Droplets,
  CreditCard,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  UserCog,
  Shield,
  FileText,
} from 'lucide-react';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

type Pago = {
  id: string;
  mes: number;
  anio: number;
  estado: string | null;
  folio: string | null;
  monto: string;
  esReconexion: boolean | null;
};

type DatosResidente = {
  perfil: any | null;
  circuito: any | null;
  pagos: Pago[];
  corteActivo: boolean;
  esMoroso: boolean;
  mes?: number;
  anio?: number;
};

export default function ResidentePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [datos, setDatos] = useState<DatosResidente | null>(null);
  const [miRol, setMiRol] = useState<string>('residente');
  const [cargando, setCargando] = useState(true);
  const [pagando, setPagando] = useState(false);
  const [exito, setExito] = useState<{
    folio: string;
    monto: string;
  } | null>(null);
  const [error, setError] = useState('');

  const ahora = new Date();
  const mesActual = ahora.getMonth() + 1;
  const anioActual = ahora.getFullYear();

  // Obtener el rol del usuario autenticado
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMiRol(d.role ?? 'residente'))
      .catch(() => setMiRol('residente'));
  }, []);

  function normalizeDatos(d: any): DatosResidente | null {
    if (!d) return null;
    const mes = d.mes == null ? undefined : Number(d.mes);
    const anio = d.anio == null ? undefined : Number(d.anio);
    return {
      ...d,
      mes,
      anio,
    } as DatosResidente;
  }

  async function cargarDatos() {
    try {
      const data = await trpc.pagos.miHistorial.query();
      setDatos(normalizeDatos(data));
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  const yaPagoEsteMes = datos?.pagos.some(
    (p) => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado'
  );

  // ✅ Monto dinámico según el circuito
  const montoMensual = Number(datos?.perfil?.circuito?.montoMensual ?? 50);
  const montoReconexion = Number(datos?.perfil?.circuito?.montoReconexion ?? 300);
  const montoAPagar = (
    datos?.perfil?.estadoAgua === 'cortado'
      ? montoMensual + montoReconexion
      : montoMensual
  ).toFixed(2);

  async function handlePagar() {
    setPagando(true);
    setError('');
    setExito(null);

    try {
      const esReconexion = datos?.perfil?.estadoAgua === 'cortado';

      const res = await fetch('/api/mercadopago/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          esReconexion,
        }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar el pago');
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error('Error en pago:', err);
      setError(err.message || 'No se pudo iniciar el pago');
      setPagando(false);
    }
  }

  if (isPending || cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  // ✅ Si es admin, mostrar mensaje y redirigir
  if (miRol === 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-6 pt-6 text-center">
            <div className="flex justify-center">
              <Shield className="h-16 w-16 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Panel de Administrador</h2>
              <p className="text-muted-foreground mt-2">
                Los administradores no tienen acceso al panel de pagos.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Ve al panel de administrador para gestionar el sistema.
              </p>
            </div>
            <Button onClick={() => router.push('/admin')} className="w-full">
              Ir al panel de administrador
            </Button>
            <Button variant="outline" onClick={salir} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!datos?.perfil) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <p>No encontramos tu perfil de residente.</p>
            <Button onClick={() => router.push('/registro')}>
              Completar registro
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = miRol === 'admin';
  const isRepresentante = miRol === 'representante';
  const isTrabajador = miRol === 'cuadrilla_cortes';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">Mi Cuenta de Agua</h1>
                <Badge variant="secondary" className="bg-white/20 text-white">
                  {miRol}
                </Badge>
              </div>
              <p className="mt-2 text-sky-100">
                {session?.user?.name} · {datos.perfil.edificio}, {datos.perfil.departamento}
              </p>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => router.push('/admin')}
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              )}
              {isRepresentante && (
                <Button
                  variant="secondary"
                  onClick={() => router.push('/representante')}
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  Representante
                </Button>
              )}
              {isTrabajador && (
                <Button
                  variant="secondary"
                  onClick={() => router.push('/trabajador')}
                  className="bg-white/20 text-white hover:bg-white/30"
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  Trabajador
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => router.push('/residente/folios')}
                className="bg-white/20 text-white hover:bg-white/30"
              >
                <FileText className="mr-2 h-4 w-4" />
                Folios
              </Button>
              <Button variant="secondary" onClick={salir}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>

        {/* ⚠️ AVISO DE CORTE ACTIVO */}
        {datos.corteActivo && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-700">
                  Tu servicio está suspendido
                </p>
                <p className="mt-1 text-sm text-red-600">
                  Debes pagar ${montoAPagar} MXN ({montoMensual.toFixed(2)} de mensualidad + {montoReconexion.toFixed(2)} de reconexión).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ AVISO DE MOROSO (si no ha pagado y pasó el día 5) */}
        {datos.esMoroso && !datos.corteActivo && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-700">
                  ⚠ Tu pago venció el día 5 del mes
                </p>
                <p className="mt-1 text-sm text-amber-600">
                  Realiza tu pago a la brevedad para evitar el corte del servicio.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ AVISO DE PENDIENTE DE CORTE (para nuevos registros después del día 5) */}
        {datos.perfil?.estadoAgua === 'pendiente_corte' && !datos.corteActivo && !datos.esMoroso && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-700">
                  ⚠ Te registraste después del día 5 del mes
                </p>
                <p className="mt-1 text-sm text-amber-600">
                  Debes pagar ${montoAPagar} MXN para activar tu servicio.
                  <br />
                  <span className="text-xs">Si no pagas, la cuadrilla irá a cortar físicamente el servicio.</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ AVISO DE PENDIENTE DE RECONEXIÓN */}
        {datos.perfil?.estadoAgua === 'pendiente_reconexion' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-700">
                  🔄 Tu pago de reconexión fue registrado
                </p>
                <p className="mt-1 text-sm text-blue-600">
                  La cuadrilla está en camino para reconectar tu servicio físicamente.
                  <br />
                  <span className="text-xs">El proceso puede tomar hasta 24 horas hábiles.</span>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pago - Solo visible para no-admins */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {MESES[mesActual - 1]} {anioActual}
              </CardTitle>
              <CardDescription>Estado del mes actual</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <span>Estado</span>
                <Badge variant={yaPagoEsteMes ? 'default' : 'destructive'}>
                  {yaPagoEsteMes ? 'Pagado' : 'Pendiente'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span>Monto a pagar</span>
                <span className="text-2xl font-bold">${montoAPagar} MXN</span>
              </div>

              {!yaPagoEsteMes && !exito && datos.perfil?.estadoAgua !== 'pendiente_reconexion' && (
                <Button
                  className="w-full h-12"
                  onClick={handlePagar}
                  disabled={pagando}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {pagando ? 'Redirigiendo a Mercado Pago...' : `Pagar $${montoAPagar} con Mercado Pago`}
                </Button>
              )}

              {datos.perfil?.estadoAgua === 'pendiente_reconexion' && (
                <Button className="w-full h-12" disabled>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Esperando reconexión física...
                </Button>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {exito && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
                  <p className="font-semibold text-green-700">
                    Pago registrado correctamente
                  </p>
                  <p className="mt-3 text-sm">
                    Folio: <span className="font-bold">{exito.folio}</span>
                  </p>
                  <p className="text-sm">
                    Monto: <span className="font-bold">${exito.monto} MXN</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    La cuadrilla será notificada para reconectar tu servicio.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Servicio */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    datos.corteActivo ? 'bg-red-100' :
                    datos.perfil?.estadoAgua === 'pendiente_reconexion' ? 'bg-blue-100' :
                    'bg-green-100'
                  }`}
                >
                  <Droplets
                    className={`h-7 w-7 ${
                      datos.corteActivo ? 'text-red-600' :
                      datos.perfil?.estadoAgua === 'pendiente_reconexion' ? 'text-blue-600' :
                      'text-green-600'
                    }`}
                  />
                </div>
                <div>
                  <p className="font-semibold">Servicio de agua</p>
                  <p
                    className={`text-sm ${
                      datos.corteActivo ? 'text-red-600' :
                      datos.perfil?.estadoAgua === 'pendiente_reconexion' ? 'text-blue-600' :
                      'text-green-600'
                    }`}
                  >
                    {datos.corteActivo ? 'Suspendido' :
                     datos.perfil?.estadoAgua === 'pendiente_reconexion' ? 'Pendiente de reconexión' :
                     datos.perfil?.estadoAgua === 'pendiente_corte' ? 'Pendiente de corte' :
                     'Activo'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historial */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Historial de pagos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {datos.pagos.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">
                    Sin pagos registrados.
                  </p>
                )}
                {datos.pagos.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {MESES[p.mes - 1]} {p.anio}
                      </p>
                      {p.folio && (
                        <p className="text-sm text-muted-foreground">
                          {p.folio}
                        </p>
                      )}
                      {p.esReconexion && (
                        <p className="text-sm text-amber-600">
                          Incluye reconexión
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">${p.monto}</span>
                      <Badge
                        variant={p.estado === 'pagado' ? 'default' : 'destructive'}
                      >
                        {p.estado}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
