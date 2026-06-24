'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/hooks/useAuth';
import { useMiHistorial, useCheckoutMP } from '@/hooks/usePagos';
import { calcularDesglosePago, calcularMontoBase } from '@/src/domain/pagos/calculator';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Droplets, CreditCard, LogOut, AlertTriangle, UserCog, FileText } from 'lucide-react';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ROL_LABEL: Record<string, string> = {
  residente:        'Residente',
  cuadrilla_cortes: 'Cuadrilla',
  tesorera:         'Tesorera/o',
  representante:    'Representante',
  admin:            'Admin',
};

export function ResidenteDashboard() {
  const router = useRouter();
  const { data: sessionData, isPending: sessionPending } = useSession();
  const { data: historial, isLoading: historialLoading } = useMiHistorial();
  const { checkout, isPending: pagando, error } = useCheckoutMP();

  const miRol = sessionData?.user?.role ?? 'residente';
  const cargando = historialLoading || sessionPending;

  const ahora = new Date();
  const mesActual = ahora.getMonth() + 1;
  const anioActual = ahora.getFullYear();

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  }

  if (!historial?.perfil) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <p>No encontramos tu perfil de residente.</p>
            <Button onClick={() => router.push('/registro')}>Completar registro</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { perfil, pagos, esMoroso } = historial;
  const yaPagoEsteMes = pagos.some(p => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado');
  const montoMensual  = Number(perfil.circuito?.montoMensual ?? 50);
  const montoReconexion = Number(perfil.circuito?.montoReconexion ?? 300);
  const esReconexion  = perfil.estadoAgua === 'cortado';
  const montoBase     = calcularMontoBase(montoMensual, esReconexion, montoReconexion);
  const desglose      = calcularDesglosePago(montoBase);
  const montoAPagar   = montoBase.toFixed(2);
  const totalConCargos = desglose.total;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">

        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">Mi Cuenta de Agua</h1>
                <Badge variant="secondary" className="bg-white/20 text-white">{ROL_LABEL[miRol] ?? miRol}</Badge>
              </div>
              <p className="mt-2 text-sky-100">{sessionData?.user?.name} · {perfil.edificio}, {perfil.departamento}</p>
            </div>
            <div className="flex gap-2">
              {miRol === 'representante' && (
                <Button variant="secondary" onClick={() => router.push('/representante')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" />Representante
                </Button>
              )}
              {miRol === 'tesorera' && (
                <Button variant="secondary" onClick={() => router.push('/tesorera/reportes')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" />Tesorera-o
                </Button>
              )}
              {miRol === 'cuadrilla_cortes' && (
                <Button variant="secondary" onClick={() => router.push('/trabajador')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" />Cuadrilla
                </Button>
              )}
              <Button variant="secondary" onClick={() => router.push('/residente/folios')} className="bg-white/20 text-white hover:bg-white/30">
                <FileText className="mr-2 h-4 w-4" />Recibos
              </Button>
              <Button variant="secondary" onClick={salir}><LogOut className="mr-2 h-4 w-4" />Salir</Button>
            </div>
          </div>
        </div>

        {perfil.estadoAgua === 'cortado' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-700">Tu servicio está suspendido</p>
                <p className="mt-1 text-sm text-red-600">Debes pagar ${totalConCargos} MXN con tarjeta (${montoMensual.toFixed(2)} mensualidad + ${montoReconexion.toFixed(2)} reconexión + comisiones MP).</p>
              </div>
            </div>
          </div>
        )}

        {esMoroso && perfil.estadoAgua === 'pendiente_corte' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-700">⚠ Tu pago venció el día 5 del mes</p>
                <p className="mt-1 text-sm text-amber-600">Realiza tu pago a la brevedad para evitar el corte del servicio.</p>
              </div>
            </div>
          </div>
        )}

        {perfil.estadoAgua === 'pendiente_reconexion' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-700">🔄 Tu pago de reconexión fue registrado</p>
                <p className="mt-1 text-sm text-blue-600">La cuadrilla está en camino. El proceso puede tomar hasta 24 horas hábiles.</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{MESES[mesActual - 1]} {anioActual}</CardTitle>
              <CardDescription>Estado del mes actual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <span>Estado</span>
                <Badge variant={yaPagoEsteMes ? 'default' : 'destructive'}>{yaPagoEsteMes ? 'Pagado' : 'Pendiente'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Monto a pagar con tarjeta</span>
                <div className="text-right">
                  <span className="text-2xl font-bold">${totalConCargos} MXN</span>
                  <p className="text-xs text-muted-foreground">
                    Cuota ${montoAPagar} + comisión y retenciones MP
                  </p>
                </div>
              </div>
              {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && (
                <Button className="w-full h-12" onClick={() => checkout(perfil.estadoAgua === 'cortado')} disabled={pagando}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {pagando ? 'Redirigiendo a Mercado Pago...' : `Pagar $${totalConCargos} con Mercado Pago`}
                </Button>
              )}
              {perfil.estadoAgua === 'pendiente_reconexion' && (
                <Button className="w-full h-12" disabled><CreditCard className="mr-2 h-4 w-4" />Esperando reconexión física...</Button>
              )}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  perfil.estadoAgua === 'cortado' ? 'bg-red-100' :
                  perfil.estadoAgua === 'pendiente_reconexion' ? 'bg-blue-100' :
                  'bg-green-100'
                }`}>
                  <Droplets className={`h-7 w-7 ${
                    perfil.estadoAgua === 'cortado' ? 'text-red-600' :
                    perfil.estadoAgua === 'pendiente_reconexion' ? 'text-blue-600' :
                    'text-green-600'
                  }`} />
                </div>
                <div>
                  <p className="font-semibold">Servicio de agua</p>
                  <p className={`text-sm ${
                    perfil.estadoAgua === 'cortado' ? 'text-red-600' :
                    perfil.estadoAgua === 'pendiente_reconexion' ? 'text-blue-600' :
                    'text-green-600'
                  }`}>
                    {perfil.estadoAgua === 'cortado' ? 'Suspendido' :
                     perfil.estadoAgua === 'pendiente_reconexion' ? 'Pendiente de reconexión' :
                     perfil.estadoAgua === 'pendiente_corte' ? 'Pendiente de corte' : 'Activo'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Historial de pagos</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pagos.length === 0 && <p className="py-10 text-center text-muted-foreground">Sin pagos registrados.</p>}
                {pagos.map((p) => (
                  <div key={p.id} className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{MESES[p.mes - 1]} {p.anio}</p>
                      {p.folio && <p className="text-sm text-muted-foreground">{p.folio}</p>}
                      {p.esReconexion && <p className="text-sm text-amber-600">Incluye reconexión</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">${p.monto}</span>
                      <Badge variant={p.estado === 'pagado' ? 'default' : 'destructive'}>{p.estado}</Badge>
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
