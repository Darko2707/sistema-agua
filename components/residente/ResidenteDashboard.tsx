'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/hooks/useAuth';
import { useMiHistorial, useCheckoutMP } from '@/hooks/usePagos';
import { ResidenteDashboardSkeleton } from './ResidenteDashboardSkeleton';
import { MESES_FULL as MESES } from '@/lib/meses';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Droplets, CreditCard, LogOut, AlertTriangle, UserCog, FileText,
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

const ROL_LABEL: Record<string, string> = {
  residente:        'Residente',
  cuadrilla_cortes: 'Cuadrilla',
  tesorera:         'Tesorera/o',
  representante:    'Representante',
  admin:            'Admin',
};

// U11: differentiated messages for each MP result
const PAYMENT_RESULT = {
  success: {
    msg:     '¡Tu pago fue procesado correctamente! Tu historial se actualizará en breve.',
    icon:    CheckCircle2,
    cls:     'border-green-300 bg-green-50 text-green-800',
    iconCls: 'text-green-600',
  },
  pending: {
    msg:     'Tu pago está siendo verificado por Mercado Pago. Te notificaremos cuando se confirme.',
    icon:    Clock,
    cls:     'border-amber-300 bg-amber-50 text-amber-800',
    iconCls: 'text-amber-600',
  },
  failure: {
    msg:     'El pago no se completó. Revisa los datos de tu tarjeta e intenta nuevamente.',
    icon:    XCircle,
    cls:     'border-red-300 bg-red-50 text-red-800',
    iconCls: 'text-red-600',
  },
} as const;

const ESTADO_AGUA_LABEL: Record<string, string> = {
  activo:               'Activo',
  pendiente_corte:      'Pendiente de corte',
  cortado:              'Suspendido',
  pendiente_reconexion: 'Pendiente de reconexión',
};

function formatFecha(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// U13: collapsible fee breakdown shown before checkout
function DesgloseCargos({
  desglose,
  montoMensual,
  esReconexion,
  montoReconexion,
}: {
  desglose: { montoBase: string; comisionMercadoPago: string; retencionIsr: string; retencionIva: string; total: string };
  montoMensual: number;
  esReconexion: boolean;
  montoReconexion: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls="desglose-cargos"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-sky-800 hover:bg-sky-100 transition-colors rounded-xl"
      >
        <span className="flex items-center gap-2">
          <Info className="h-4 w-4" aria-hidden="true" />
          ¿Por qué el total es ${desglose.total}?
        </span>
        {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <div id="desglose-cargos" className="border-t border-sky-200 px-4 pb-4 pt-3 space-y-2 text-sm">
          <p className="text-xs text-sky-700 mb-3">
            Mercado Pago cobra una comisión por procesar el pago con tarjeta. Para que tu circuito reciba el monto completo, esos cargos se incluyen en el total.
          </p>
          <div className="space-y-1">
            <Row label="Cuota mensual" value={`$${montoMensual.toFixed(2)}`} />
            {esReconexion && <Row label="Cargo de reconexión" value={`$${montoReconexion.toFixed(2)}`} />}
            <Row label="Comisión Mercado Pago" value={`$${desglose.comisionMercadoPago}`} muted />
            <Row label="Retención ISR (MP)" value={`$${desglose.retencionIsr}`} muted />
            <Row label="Retención IVA (MP)" value={`$${desglose.retencionIva}`} muted />
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-sky-200 pt-2 font-semibold text-sky-900">
            <span>Total a pagar</span>
            <span>${desglose.total} MXN</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-sky-600' : 'text-sky-800'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ResidenteDashboard() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { data: sessionData, isPending: sessionPending } = useSession();
  const { data: historial, isLoading: historialLoading } = useMiHistorial();
  const { checkout, isPending: pagando, error } = useCheckoutMP();

  // U2 / U11: announce MP return and restore focus
  const paymentResult = searchParams.get('payment') as keyof typeof PAYMENT_RESULT | null;
  const announcerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paymentResult && PAYMENT_RESULT[paymentResult]) {
      announcerRef.current?.focus();
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.toString());
    }
  }, [paymentResult]);

  const miRol    = sessionData?.user?.role ?? 'residente';
  const cargando = historialLoading || sessionPending;

  const ahora      = new Date();
  const mesActual  = ahora.getMonth() + 1;
  const anioActual = ahora.getFullYear();

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  // U8: skeleton instead of text while loading
  if (cargando) return <ResidenteDashboardSkeleton />;

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

  const { perfil, pagos, esMoroso, diasVencido, desgloseVigente, corteActivo } = historial;
  const yaPagoEsteMes  = pagos.some(p => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado');
  // U5: server-computed desglose
  const totalConCargos = desgloseVigente?.total ?? '0.00';
  const montoMensual   = Number(perfil.circuito?.montoMensual ?? 50);
  const montoReconexion = Number(perfil.circuito?.montoReconexion ?? 300);
  const esReconexion   = perfil.estadoAgua === 'cortado';

  const estadoLabel   = ESTADO_AGUA_LABEL[perfil.estadoAgua] ?? perfil.estadoAgua;
  const resultInfo    = paymentResult ? PAYMENT_RESULT[paymentResult] : null;

  // U12: ticket folio from the pending reconexion payment
  const pagoReconexion = pagos.find(p => p.esReconexion && p.estado === 'pagado' && p.mes === mesActual && p.anio === anioActual)
    ?? pagos.find(p => p.esReconexion && p.estado === 'pagado');
  const fechaCorteStr = corteActivo?.fechaCorte ? formatFecha(corteActivo.fechaCorte) : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* U11: post-MP return announcement */}
        {resultInfo && (
          <div
            ref={announcerRef}
            role="status"
            aria-live="assertive"
            tabIndex={-1}
            className={`flex items-start gap-3 rounded-2xl border p-4 focus:outline-none ${resultInfo.cls}`}
          >
            <resultInfo.icon className={`h-5 w-5 shrink-0 mt-0.5 ${resultInfo.iconCls}`} aria-hidden="true" />
            <p className="text-sm font-medium">{resultInfo.msg}</p>
          </div>
        )}

        {/* Header */}
        <header className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">Mi Cuenta de Agua</h1>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white"
                  aria-label={`Tu rol: ${ROL_LABEL[miRol] ?? miRol}`}
                >
                  {ROL_LABEL[miRol] ?? miRol}
                </Badge>
              </div>
              <p className="mt-2 text-sky-100">{sessionData?.user?.name} · {perfil.edificio}, {perfil.departamento}</p>
            </div>
            <nav aria-label="Accesos directos" className="flex flex-wrap gap-2">
              {miRol === 'representante' && (
                <Button variant="secondary" onClick={() => router.push('/representante')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />Representante
                </Button>
              )}
              {miRol === 'tesorera' && (
                <Button variant="secondary" onClick={() => router.push('/tesorera/reportes')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />Tesorera-o
                </Button>
              )}
              {miRol === 'cuadrilla_cortes' && (
                <Button variant="secondary" onClick={() => router.push('/trabajador')} className="bg-white/20 text-white hover:bg-white/30">
                  <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />Cuadrilla
                </Button>
              )}
              <Button variant="secondary" onClick={() => router.push('/residente/folios')} className="bg-white/20 text-white hover:bg-white/30">
                <FileText className="mr-2 h-4 w-4" aria-hidden="true" />Recibos
              </Button>
              <Button variant="secondary" onClick={salir} aria-label="Cerrar sesión">
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />Salir
              </Button>
            </nav>
          </div>
        </header>

        {/* Status alerts */}
        {perfil.estadoAgua === 'cortado' && (
          <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-red-800">Tu servicio está suspendido</p>
                <p className="mt-1 text-sm text-red-700">
                  Debes pagar ${totalConCargos} MXN con tarjeta para reactivarlo (cuota + cargo de reconexión + comisiones MP).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* U10: urgency banner with exact days overdue */}
        {esMoroso && perfil.estadoAgua === 'pendiente_corte' && (
          <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-800">
                  Llevas {diasVencido} {diasVencido === 1 ? 'día' : 'días'} de atraso — riesgo de corte
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  Tu cuota venció el día 5. La cuadrilla puede suspender el servicio en cualquier momento. Paga ahora para evitarlo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* U12: reconnection details */}
        {perfil.estadoAgua === 'pendiente_reconexion' && (
          <div role="status" aria-live="polite" className="rounded-2xl border border-sky-300 bg-sky-50 p-5">
            <div className="flex items-start gap-3">
              <Clock className="h-6 w-6 shrink-0 text-sky-600" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold text-sky-800">Tu pago de reconexión fue registrado</p>
                {fechaCorteStr && (
                  <p className="text-sm text-sky-700">
                    Corte registrado el {fechaCorteStr}. La cuadrilla llegará en las próximas <strong>24–48 horas hábiles</strong>.
                  </p>
                )}
                {pagoReconexion?.folio && (
                  <p className="text-sm text-sky-700">
                    Folio de tu pago: <strong className="font-mono">{pagoReconexion.folio}</strong>
                  </p>
                )}
                <p className="text-xs text-sky-600 mt-1">
                  Si después de 48 h hábiles no llega la cuadrilla, comunícate con tu representante de circuito.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Payment card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{MESES[mesActual - 1]} {anioActual}</CardTitle>
              <CardDescription>Estado del mes actual</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <span id="estado-mes-label">Estado</span>
                <Badge
                  role="status"
                  aria-labelledby="estado-mes-label"
                  variant={yaPagoEsteMes ? 'default' : 'destructive'}
                >
                  {yaPagoEsteMes ? 'Pagado' : 'Pendiente'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span id="monto-label">Monto a pagar con tarjeta</span>
                <div className="text-right" aria-labelledby="monto-label">
                  <span className="text-2xl font-bold">${totalConCargos} MXN</span>
                  <p className="text-xs text-muted-foreground">incluye comisiones MP</p>
                </div>
              </div>

              {/* U13: fee breakdown before checkout */}
              {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && desgloseVigente && (
                <DesgloseCargos
                  desglose={desgloseVigente}
                  montoMensual={montoMensual}
                  esReconexion={esReconexion}
                  montoReconexion={montoReconexion}
                />
              )}

              {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && (
                <Button
                  className="w-full h-12"
                  onClick={() => checkout(esReconexion)}
                  disabled={pagando}
                  aria-describedby="monto-label"
                  aria-busy={pagando}
                >
                  <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  {pagando ? 'Redirigiendo a Mercado Pago...' : `Pagar $${totalConCargos} con Mercado Pago`}
                </Button>
              )}
              {perfil.estadoAgua === 'pendiente_reconexion' && (
                <Button className="w-full h-12" disabled aria-label="Reconexión en proceso, no se requiere acción">
                  <Clock className="mr-2 h-4 w-4" aria-hidden="true" />Esperando reconexión física...
                </Button>
              )}
              {error && (
                <div role="alert" aria-live="assertive" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Water service status card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    perfil.estadoAgua === 'cortado'              ? 'bg-red-100'   :
                    perfil.estadoAgua === 'pendiente_reconexion' ? 'bg-sky-100'   :
                    perfil.estadoAgua === 'pendiente_corte'      ? 'bg-amber-100' :
                    'bg-green-100'
                  }`}
                  aria-hidden="true"
                >
                  <Droplets className={`h-7 w-7 ${
                    perfil.estadoAgua === 'cortado'              ? 'text-red-700'   :
                    perfil.estadoAgua === 'pendiente_reconexion' ? 'text-sky-700'   :
                    perfil.estadoAgua === 'pendiente_corte'      ? 'text-amber-700' :
                    'text-green-700'
                  }`} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold">Servicio de agua</p>
                  <p
                    role="status"
                    className={`text-sm font-medium ${
                      perfil.estadoAgua === 'cortado'              ? 'text-red-800'   :
                      perfil.estadoAgua === 'pendiente_reconexion' ? 'text-sky-800'   :
                      perfil.estadoAgua === 'pendiente_corte'      ? 'text-amber-800' :
                      'text-green-800'
                    }`}
                  >
                    {estadoLabel}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment history */}
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>Historial de pagos</CardTitle></CardHeader>
            <CardContent>
              {/* U9: empty state with CTA */}
              {pagos.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-100" aria-hidden="true">
                    <Droplets className="h-10 w-10 text-sky-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">Aún no tienes pagos registrados</p>
                    <p className="mt-1 text-sm text-muted-foreground">Tu historial aparecerá aquí una vez que realices tu primer pago.</p>
                  </div>
                  {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && (
                    <Button
                      variant="outline"
                      onClick={() => checkout(esReconexion)}
                      disabled={pagando}
                      aria-busy={pagando}
                      className="mt-2"
                    >
                      <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                      Realizar primer pago
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3" role="list" aria-label="Historial de pagos">
                  {pagos.map((p) => (
                    <div
                      key={p.id}
                      role="listitem"
                      className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-medium">{MESES[p.mes - 1]} {p.anio}</p>
                        {p.folio && <p className="text-sm text-muted-foreground font-mono">Folio: {p.folio}</p>}
                        {p.esReconexion && <p className="text-xs text-amber-800 font-medium">Incluye reconexión</p>}
                        {p.fechaPago && (
                          <p className="text-xs text-muted-foreground">{formatFecha(p.fechaPago)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold" aria-label={`Monto: $${p.monto} MXN`}>${p.monto}</span>
                        <Badge
                          role="status"
                          variant={p.estado === 'pagado' ? 'default' : 'destructive'}
                          aria-label={`Estado: ${p.estado}`}
                        >
                          {p.estado}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
