'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/hooks/useAuth';
import { useMiHistorial, useCheckoutCombinadoMP } from '@/hooks/usePagos';
import { trpcReact } from '@/lib/trpc-react';
import { ResidenteDashboardSkeleton } from './ResidenteDashboardSkeleton';
import { MESES_FULL as MESES } from '@/lib/meses';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { calcularDesglosePago } from '@/src/domain/pagos/calculator';
import { homePathForRole } from '@/lib/role-home';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:          '#F4EEE0',
  header:      '#FBF6EB',
  green:       '#15493A',
  greenDark:   '#15623A',
  gold:        '#F4B223',
  goldLight:   '#F8C84E',
  textWarm:    '#9A8E72',
  textWarm2:   '#A89A7C',
  textWarm3:   '#B0A488',
  textMain:    '#3A3528',
  alertBg:     '#FBE4D6',
  alertBorder: '#F3C9AE',
  alertText:   '#B14A18',
  alertText2:  '#B5683C',
  alertIcon:   '#F4B27E',
  pendingBg:   '#FBEAE9',
  pendingText: '#C62B27',
  greenBg:     '#E6F1E5',
  green2:      '#5E7D2A',
  border:      '#F2EAD8',
  border2:     '#F4EEDF',
  border3:     '#EFE3CC',
  successText: '#15623A',
};

const FM = "var(--font-mulish), 'Mulish', sans-serif";
const FB = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// ── Payment result data ────────────────────────────────────────────────────────
const PAYMENT_RESULT = {
  success: {
    msg:     '¡Tu pago fue procesado correctamente! Tu historial se actualizará en breve.',
    bg:      '#E6F4EC',
    text:    '#15623A',
    iconBg:  '#B7E3C8',
    Icon:    CheckCircle2,
  },
  pending: {
    msg:     'Tu pago está siendo verificado por Mercado Pago. Consulta aquí el estado; si activaste las notificaciones push, te avisaremos cuando se confirme.',
    bg:      '#FFF8E6',
    text:    '#8A5800',
    iconBg:  '#FFD980',
    Icon:    Clock,
  },
  failure: {
    msg:     'El pago no se completó. Revisa los datos de tu tarjeta e intenta nuevamente.',
    bg:      '#FBEAE9',
    text:    '#C62B27',
    iconBg:  '#F4A0A0',
    Icon:    XCircle,
  },
} as const;

function formatFecha(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function addMonths(mes: number, anio: number, offset: number) {
  const total = mes - 1 + offset;
  return {
    mes:  (total % 12) + 1,
    anio: anio + Math.floor(total / 12),
  };
}

function pagoKey(pago: { mes: number; anio: number }) {
  return `${pago.anio}-${pago.mes}`;
}

// ── Dropdown menu item ─────────────────────────────────────────────────────────
function MenuItem({
  label, icon, danger, onClick,
}: {
  label:   string;
  icon:    'role' | 'doc' | 'logout';
  danger?: boolean;
  onClick?: () => void;
}) {
  const color = danger ? C.pendingText : C.greenDark;
  const iconSvg =
    icon === 'role' ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4a4 4 0 100 8 4 4 0 000-8z"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ) : icon === 'doc' ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/>
      </svg>
    ) : (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4"/><path d="M16 8l4 4-4 4"/><path d="M20 12H9"/>
      </svg>
    );

  return (
    <div
      role="menuitem"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 13, cursor: 'pointer', outline: 'none' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#FBEAE9' : '#FBF4E6')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onFocus={e => (e.currentTarget.style.background = danger ? '#FBEAE9' : '#FBF4E6')}
      onBlur={e => (e.currentTarget.style.background = 'transparent')}
    >
      {iconSvg}
      <span style={{ fontSize: 14, fontWeight: 700, color: danger ? C.pendingText : C.textMain, fontFamily: FM }}>{label}</span>
    </div>
  );
}

// ── Chevron ────────────────────────────────────────────────────────────────────
function Chevron({ up, color = C.textWarm }: { up?: boolean; color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

// ── Water drop icon ────────────────────────────────────────────────────────────
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image src="/logo1SIS4S.png" alt="SISCO" width={size} height={size} style={{ objectFit: 'contain' }} priority />
  );
}

// ── Uniform Service Card ───────────────────────────────────────────────────────
function ServiceCard({
  nombre,
  montoMensual,
  estadoBadge,
  badgeBg,
  badgeColor,
  seleccionado,
  onToggle,
  meses,
  onMesesChange,
  subtotal,
  periodoDetalle,
  deshabilitado,
}: {
  nombre: string;
  montoMensual: number;
  estadoBadge: string;
  badgeBg: string;
  badgeColor: string;
  seleccionado: boolean;
  onToggle: (checked: boolean) => void;
  meses: number;
  onMesesChange: (meses: number) => void;
  subtotal: number;
  periodoDetalle: string;
  deshabilitado?: boolean;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: '16px 18px',
        border: seleccionado ? `2px solid ${C.greenDark}` : `1px solid ${C.border3}`,
        boxShadow: seleccionado ? '0 6px 20px rgba(21,98,58,.08)' : '0 4px 14px rgba(120,90,30,.04)',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: deshabilitado ? 'not-allowed' : 'pointer', flex: 1, minWidth: 0 }}>
          <input
            type="checkbox"
            checked={seleccionado}
            onChange={e => onToggle(e.target.checked)}
            disabled={deshabilitado}
            style={{ width: 18, height: 18, accentColor: C.greenDark, cursor: deshabilitado ? 'not-allowed' : 'pointer', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: C.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombre}
            </div>
            <div style={{ fontSize: 12, color: C.textWarm, fontWeight: 600, marginTop: 1 }}>
              ${montoMensual.toFixed(2)} MXN / mes
            </div>
          </div>
        </label>
        <span
          role="status"
          style={{
            background: badgeBg,
            color: badgeColor,
            fontSize: 11.5,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {estadoBadge}
        </span>
      </div>

      {seleccionado && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, maxWidth: 180 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: C.textWarm, marginBottom: 5 }}>
                Meses a pagar
              </label>
              <select
                value={meses}
                onChange={e => onMesesChange(Number(e.target.value))}
                aria-label={`Meses a pagar para ${nombre}`}
                style={{
                  width: '100%',
                  height: 40,
                  borderRadius: 12,
                  border: `1.5px solid ${C.border3}`,
                  background: '#FAFAF7',
                  color: C.textMain,
                  fontFamily: FM,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '0 10px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 mes' : `${n} meses`}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, color: C.textWarm, fontWeight: 600 }}>Subtotal</div>
              <div style={{ fontFamily: FB, fontSize: 17, fontWeight: 800, color: C.green }}>
                ${subtotal.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600, color: C.textWarm2 }}>MXN</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.textWarm2, marginTop: 7, fontWeight: 500 }}>
            {periodoDetalle}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export function ResidenteDashboard() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { data: sessionData, isPending: sessionPending } = useSession();
  const { data: historial, isLoading: historialLoading, refetch: refetchHistorial } = useMiHistorial();
  const { checkout, isPending: pagando, error } = useCheckoutCombinadoMP();
  const utils = trpcReact.useUtils();
  const { data: cargos } = trpcReact.servicios.misCargos.useQuery();
  const { data: servicios } = trpcReact.servicios.misServicios.useQuery();
  const asignacionQ = trpcReact.usuarios.miAsignacionOperativa.useQuery(undefined, {
    enabled: !!sessionData?.user,
  });
  const tieneAsignacionCuadrilla = Boolean(asignacionQ.data && asignacionQ.data.length > 0);
  const sincronizarCargos = trpcReact.servicios.sincronizarMisCargos.useMutation({
    onSuccess: () => { void utils.servicios.misCargos.invalidate(); },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // Estados de selección independientes por servicio
  const [mesesAgua, setMesesAgua] = useState(1);
  const [incluirAgua, setIncluirAgua] = useState(true);
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<Record<string, boolean>>({});
  const [mesesPorServicio, setMesesPorServicio] = useState<Record<string, number>>({});

  const menuRef      = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  const paymentResult = searchParams.get('payment') as keyof typeof PAYMENT_RESULT | null;

  // Announce MP result and clean URL
  useEffect(() => {
    if (paymentResult && PAYMENT_RESULT[paymentResult]) {
      announcerRef.current?.focus();
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.toString());
    }
  }, [paymentResult]);

  useEffect(() => {
    if (paymentResult !== 'success' && paymentResult !== 'pending') return;

    let active = true;
    const timers = [0, 2_000, 5_000, 10_000].map((delay) =>
      window.setTimeout(() => {
        if (active) void refetchHistorial();
      }, delay),
    );

    return () => {
      active = false;
      timers.forEach(window.clearTimeout);
    };
  }, [paymentResult, refetchHistorial]);

  useEffect(() => {
    if (!sessionData?.user || !historial?.perfil || sincronizarCargos.isPending || sincronizarCargos.isSuccess) return;
    sincronizarCargos.mutate();
  }, [sessionData?.user, historial?.perfil, sincronizarCargos]);

  const roleWithoutResidentProfile = sessionData?.user?.role;
  const workerHome = homePathForRole(roleWithoutResidentProfile);
  useEffect(() => {
    if (historialLoading || sessionPending || historial?.perfil) return;
    if (roleWithoutResidentProfile === 'residente' || !roleWithoutResidentProfile) return;
    router.replace(workerHome);
  }, [historialLoading, sessionPending, historial?.perfil, roleWithoutResidentProfile, router, workerHome]);

  function estaServicioSeleccionado(servicioId: string) {
    if (servicioId in serviciosSeleccionados) {
      return Boolean(serviciosSeleccionados[servicioId]);
    }
    return (cargos ?? []).some(c => c.fraccionamientoServicioId === servicioId && c.estado === 'pendiente');
  }

  // Close menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const cargando = historialLoading || sessionPending;
  if (cargando) return <ResidenteDashboardSkeleton />;

  if (!historial?.perfil) {
    const isWorker = roleWithoutResidentProfile && roleWithoutResidentProfile !== 'residente';
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FM }}>
        <div style={{ background: '#fff', borderRadius: 26, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 10px 28px rgba(120,90,30,.10)' }}>
          <p style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, color: C.textMain, marginBottom: 20 }}>
            {isWorker ? 'Abriendo tu panel de trabajo…' : 'No encontramos tu perfil de residente.'}
          </p>
          <button
            onClick={() => router.replace(isWorker ? workerHome : '/registro')}
            style={{ background: C.gold, color: '#5A3D06', border: 'none', borderRadius: 14, padding: '14px 28px', cursor: 'pointer', fontFamily: FB, fontSize: 15, fontWeight: 700 }}
          >
            {isWorker ? 'Ir a mi panel' : 'Completar registro'}
          </button>
        </div>
      </div>
    );
  }

  const { perfil, pagos, esMoroso, diasVencido, desgloseVigente, corteActivo } = historial;

  const ahora       = new Date();
  const mesActual   = ahora.getMonth() + 1;
  const anioActual  = ahora.getFullYear();
  const yaPagoEsteMes   = pagos.some(p => p.mes === mesActual && p.anio === anioActual && p.estado === 'pagado');
  const montoMensualAgua = Number(perfil.fraccionamiento?.montoMensual ?? 50);
  const montoReconexion  = Number(perfil.fraccionamiento?.montoReconexion ?? 300);
  const esReconexion     = perfil.estadoAgua === 'cortado';

  const serviciosActivos = (servicios ?? []).filter(servicio => servicio.clave !== 'agua');

  function calcularSubtotalServicio(s: { id: string; montoMensual: string | number }, count: number) {
    const pendingCargos = (cargos ?? [])
      .filter(c => c.fraccionamientoServicioId === s.id && c.estado === 'pendiente')
      .sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes));
    const countFromPending = Math.min(pendingCargos.length, count);
    const sumPending = pendingCargos.slice(0, countFromPending).reduce((acc, c) => acc + Number(c.monto), 0);
    const remainingCount = Math.max(0, count - countFromPending);
    const sumRemaining = remainingCount * Number(s.montoMensual);
    return sumPending + sumRemaining;
  }

  const montoBaseAgua = montoMensualAgua * mesesAgua + (esReconexion ? montoReconexion : 0);
  const totalAguaConTarjeta = Number(calcularDesglosePago(montoBaseAgua).total);

  const totalServiciosSeleccionados = serviciosActivos
    .filter(s => estaServicioSeleccionado(s.id))
    .reduce((sum, s) => sum + calcularSubtotalServicio(s, mesesPorServicio[s.id] || 1), 0);

  const totalBaseCheckout = (incluirAgua ? montoBaseAgua : 0) + totalServiciosSeleccionados;
  const desgloseCheckout = totalBaseCheckout > 0 ? calcularDesglosePago(totalBaseCheckout) : null;
  const totalCheckout = desgloseVigente && totalBaseCheckout > 0
    ? Number(desgloseCheckout?.total ?? totalBaseCheckout)
    : totalBaseCheckout;

  const userName = sessionData?.user?.name ?? 'Usuario';
  const miRol    = (sessionData?.user?.role as string) ?? 'residente';

  const initials = userName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const periodoActual = `${MESES[mesActual - 1]} ${anioActual}`;
  const pagadosKeys = new Set(pagos.filter(p => p.estado === 'pagado').map(pagoKey));
  const periodosPendientesTarjeta: Array<{ mes: number; anio: number }> = [];
  for (let offset = 0; periodosPendientesTarjeta.length < 12; offset += 1) {
    const periodo = addMonths(mesActual, anioActual, offset);
    if (periodo.anio > 2100) break;
    if (!pagadosKeys.has(pagoKey(periodo))) periodosPendientesTarjeta.push(periodo);
  }
  const primerPeriodoTarjeta = periodosPendientesTarjeta[0] ?? { mes: mesActual, anio: anioActual };
  const periodoTarjetaLabel = `${MESES[primerPeriodoTarjeta.mes - 1]} ${primerPeriodoTarjeta.anio}`;

  const puedePagarConTarjeta = totalBaseCheckout > 0 && (incluirAgua ? perfil.estadoAgua !== 'pendiente_reconexion' : true);

  const pagoReconexion = pagos.find(p => p.esReconexion && p.estado === 'pagado' && p.mes === mesActual && p.anio === anioActual)
    ?? pagos.find(p => p.esReconexion && p.estado === 'pagado');
  const fechaCorteStr = corteActivo?.fechaCorte ? formatFecha(corteActivo.fechaCorte) : null;

  const resultInfo = paymentResult ? PAYMENT_RESULT[paymentResult] : null;

  const roleNav =
    miRol === 'representante'   ? { label: 'Mi panel (Representante)', path: '/representante' } :
    miRol === 'tesorera'        ? { label: 'Mi panel (Tesorería)', path: '/tesorera' } :
    (miRol === 'cuadrilla_cortes' || tieneAsignacionCuadrilla) ? { label: 'Mi panel (Cuadrilla)', path: '/trabajador' } :
    miRol === 'admin'           ? { label: 'Mi panel (Admin)', path: '/admin' } :
    null;

  const historyItems = pagos
    .filter(p => p.estado === 'pagado')
    .sort((a, b) => b.anio !== a.anio ? b.anio - a.anio : b.mes - a.mes)
    .slice(0, 6);

  const breakdown = desgloseCheckout ? [
    ...(incluirAgua ? [{
      label: mesesAgua === 1 ? 'Cuota mensual de agua' : `Agua (${mesesAgua} meses)`,
      value: `$${montoBaseAgua.toFixed(2)}`,
    }] : []),
    ...serviciosActivos
      .filter(s => estaServicioSeleccionado(s.id))
      .map(s => {
        const count = mesesPorServicio[s.id] || 1;
        const sub = calcularSubtotalServicio(s, count);
        return {
          label: count === 1 ? s.nombre : `${s.nombre} (${count} meses)`,
          value: `$${sub.toFixed(2)}`,
        };
      }),
    { label: 'Comisión Mercado Pago', value: `$${desgloseCheckout.comisionMercadoPago}` },
    { label: 'Retención ISR (MP)', value: `$${desgloseCheckout.retencionIsr}` },
    { label: 'Retención IVA (MP)', value: `$${desgloseCheckout.retencionIva}` },
  ] : [];

  async function handleCheckout() {
    const adelantosServicios = serviciosActivos
      .filter(s => estaServicioSeleccionado(s.id))
      .map(s => ({
        fraccionamientoServicioId: s.id,
        meses: mesesPorServicio[s.id] || 1,
      }));

    await checkout({
      mesesAgua: incluirAgua ? mesesAgua : 0,
      servicios: adelantosServicios,
      cargoIds: [],
    });
  }

  // Datos para la tarjeta de Agua
  const badgeAguaText =
    perfil.estadoAgua === 'cortado' ? 'Suspendido' :
    perfil.estadoAgua === 'pendiente_corte' ? 'Riesgo de corte' :
    perfil.estadoAgua === 'pendiente_reconexion' ? 'Reconexión en proceso' :
    yaPagoEsteMes ? 'Pagado ✓' : 'Pendiente';

  const badgeAguaBg =
    perfil.estadoAgua === 'cortado' ? C.pendingBg :
    perfil.estadoAgua === 'pendiente_corte' ? C.alertBg :
    perfil.estadoAgua === 'pendiente_reconexion' ? '#EFF6FF' :
    yaPagoEsteMes ? C.greenBg : C.pendingBg;

  const badgeAguaColor =
    perfil.estadoAgua === 'cortado' ? C.pendingText :
    perfil.estadoAgua === 'pendiente_corte' ? C.alertText :
    perfil.estadoAgua === 'pendiente_reconexion' ? '#1E40AF' :
    yaPagoEsteMes ? C.green2 : C.pendingText;

  const detalleAgua =
    esReconexion ? 'Cuota mensual + cargo por reconexión física' :
    yaPagoEsteMes ? `Adelanto a partir del siguiente periodo (${periodoTarjetaLabel})` :
    mesesAgua === 1 ? `Periodo vigente: ${periodoActual}` :
    `${mesesAgua} periodos consecutivos no pagados`;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 64, fontFamily: FM }}>
      <div style={{ maxWidth: 580, margin: '0 auto' }}>

        {/* ── Top bar ── */}
        <div style={{ background: C.header, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, padding: '24px 22px 28px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark size={38} />
              <div>
                <span style={{ fontFamily: FB, fontWeight: 800, fontSize: 17, color: C.green, letterSpacing: '-.02em', display: 'block', lineHeight: 1 }}>
                  SISCO
                </span>
                <span style={{ fontSize: 11.5, color: C.textWarm, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  {perfil.fraccionamiento?.nombre ? `Fracc. ${perfil.fraccionamiento.nombre}` : 'Residencial'}
                </span>
              </div>
            </div>

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Menú de cuenta"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 30, padding: '5px 12px 5px 6px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(120,90,30,.09)' }}
              >
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.green, color: C.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: FB }}>
                  {initials}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.textMain }}>
                  {userName.split(' ')[0]}
                </span>
                <Chevron up={menuOpen} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Opciones de cuenta"
                  style={{ position: 'absolute', right: 0, top: 52, width: 220, background: '#fff', borderRadius: 20, boxShadow: '0 18px 46px rgba(120,90,30,.28)', padding: 7, zIndex: 20 }}
                >
                  <div style={{ padding: '10px 14px 9px', borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                    <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.textMain }}>{userName}</div>
                    <div style={{ fontSize: 12, color: C.textWarm, marginTop: 2 }}>{perfil.edificio}, {perfil.departamento}</div>
                  </div>
                  {roleNav && (
                    <MenuItem
                      label={roleNav.label}
                      icon="role"
                      onClick={() => { setMenuOpen(false); router.push(roleNav.path); }}
                    />
                  )}
                  <MenuItem
                    label="Recibos"
                    icon="doc"
                    onClick={() => { setMenuOpen(false); router.push('/residente/folios'); }}
                  />
                  <MenuItem
                    label="Servicios y cargos"
                    icon="doc"
                    onClick={() => { setMenuOpen(false); router.push('/residente/servicios'); }}
                  />
                  <div style={{ height: 1, background: C.border, margin: '5px 9px' }} />
                  <MenuItem
                    label="Cerrar sesión"
                    icon="logout"
                    danger
                    onClick={() => { setMenuOpen(false); void authClient.signOut().then(() => router.push('/login')); }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Greeting */}
          <div style={{ position: 'relative', zIndex: 1, marginTop: 22 }}>
            <div style={{ fontFamily: FB, fontSize: 29, fontWeight: 800, color: C.green, lineHeight: 1.08 }}>
              Hola, {userName.split(' ')[0]}
            </div>
            <div style={{ fontSize: 13.5, color: '#8C7E62', marginTop: 5, fontWeight: 600 }}>
              Edif. {perfil.edificio}, Depto. {perfil.departamento}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '18px 14px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Announcer */}
          <div ref={announcerRef} tabIndex={-1} aria-live="polite" style={{ outline: 'none' }}>
            {resultInfo && (
              <div role="status" style={{ background: resultInfo.bg, border: `1px solid ${resultInfo.iconBg}`, borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: resultInfo.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <resultInfo.Icon size={18} color={resultInfo.text} aria-hidden="true" />
                </span>
                <div style={{ fontFamily: FM, fontSize: 13.5, color: resultInfo.text, lineHeight: 1.5, fontWeight: 600 }}>
                  {resultInfo.msg}
                </div>
              </div>
            )}
          </div>

          {/* State alerts */}
          {perfil.estadoAgua === 'cortado' && (
            <div role="alert" style={{ background: C.pendingBg, border: '1px solid #F3BFBF', borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#F4A0A0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={18} color="#fff" aria-hidden="true" />
              </span>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.pendingText }}>Tu servicio está suspendido</div>
                <div style={{ fontSize: 13, color: '#B5683C', marginTop: 3, lineHeight: 1.5 }}>
                  Paga ${totalAguaConTarjeta.toFixed(2)} MXN con tarjeta para reactivarlo (cuota + reconexión + comisiones MP).
                </div>
              </div>
            </div>
          )}

          {esMoroso && perfil.estadoAgua === 'pendiente_corte' && (
            <div role="alert" style={{ background: C.alertBg, border: `1px solid ${C.alertBorder}`, borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: C.alertIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.6" r=".5" fill="#fff" stroke="#fff"/>
                </svg>
              </span>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.alertText }}>
                  {diasVencido} {diasVencido === 1 ? 'día' : 'días'} de atraso · riesgo de corte
                </div>
                <div style={{ fontSize: 13, color: C.alertText2, marginTop: 3, lineHeight: 1.5 }}>
                  Tu cuota venció el día 5. La cuadrilla puede suspender el servicio en cualquier momento.
                </div>
              </div>
            </div>
          )}

          {!esMoroso && !yaPagoEsteMes && perfil.estadoAgua === 'activo' && (
            <div style={{ background: C.alertBg, border: `1px solid ${C.alertBorder}`, borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: C.alertIcon, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.6" r=".5" fill="#fff" stroke="#fff"/>
                </svg>
              </span>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.alertText }}>Tu pago vence el día 5</div>
                <div style={{ fontSize: 13, color: C.alertText2, marginTop: 3, lineHeight: 1.5 }}>
                  Realiza tu pago a la brevedad para evitar el corte del servicio.
                </div>
              </div>
            </div>
          )}

          {perfil.estadoAgua === 'pendiente_reconexion' && (
            <div role="status" aria-live="polite" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#93C5FD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={17} color="#fff" aria-hidden="true" />
              </span>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: '#1E40AF' }}>Tu pago de reconexión fue registrado</div>
                <div style={{ fontSize: 13, color: '#3B82F6', marginTop: 3, lineHeight: 1.5 }}>
                  {fechaCorteStr && `Corte registrado el ${fechaCorteStr}. `}
                  La cuadrilla llegará en las próximas <strong>24–48 horas hábiles</strong>.
                  {pagoReconexion?.folio && (
                    <> Folio: <span style={{ fontFamily: 'monospace' }}>{pagoReconexion.folio}</span></>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Services section (Uniform symmetrical cards) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
              <div>
                <h2 style={{ fontFamily: FB, fontSize: 19, fontWeight: 800, color: C.green, margin: 0 }}>
                  Servicios del fraccionamiento
                </h2>
                <p style={{ fontSize: 12.5, color: C.textWarm, margin: '2px 0 0', fontWeight: 600 }}>
                  Selecciona y adelanta meses de cualquier servicio de forma independiente.
                </p>
              </div>
            </div>

            {/* Agua Card */}
            <ServiceCard
              nombre="Agua potable"
              montoMensual={montoMensualAgua}
              estadoBadge={badgeAguaText}
              badgeBg={badgeAguaBg}
              badgeColor={badgeAguaColor}
              seleccionado={incluirAgua}
              onToggle={setIncluirAgua}
              meses={mesesAgua}
              onMesesChange={setMesesAgua}
              subtotal={montoBaseAgua}
              periodoDetalle={detalleAgua}
              deshabilitado={perfil.estadoAgua === 'pendiente_reconexion'}
            />

            {/* Other Catalog Services Cards */}
            {serviciosActivos.map(servicio => {
              const cargosServicio = (cargos ?? []).filter(c => c.fraccionamientoServicioId === servicio.id);
              const pendientesServicio = cargosServicio
                .filter(c => c.estado === 'pendiente')
                .sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes);
              const pagadosServicio = cargosServicio.filter(c => c.estado === 'pagado');
              const pagadoEsteMesServicio = pagadosServicio.some(c => c.mes === mesActual && c.anio === anioActual);

              const badgeServicioText =
                pendientesServicio.length > 0 ? 'Pendiente' :
                pagadoEsteMesServicio ? 'Al corriente ✓' : 'Al corriente';

              const badgeServicioBg =
                pendientesServicio.length > 0 ? C.pendingBg : C.greenBg;

              const badgeServicioColor =
                pendientesServicio.length > 0 ? C.pendingText : C.green2;

              const mesesS = mesesPorServicio[servicio.id] || 1;
              const subtotalS = calcularSubtotalServicio(servicio, mesesS);

              const detalleServicio =
                pendientesServicio.length > 0
                  ? `Cubre ${mesesS === 1 ? `periodo pendiente (${MESES[pendientesServicio[0].mes - 1]} ${pendientesServicio[0].anio})` : `${mesesS} periodos consecutivos a partir de ${MESES[pendientesServicio[0].mes - 1]} ${pendientesServicio[0].anio}`}`
                  : `Adelanto de ${mesesS} ${mesesS === 1 ? 'periodo' : 'periodos consecutivos'}`;

              return (
                <ServiceCard
                  key={servicio.id}
                  nombre={servicio.nombre}
                  montoMensual={Number(servicio.montoMensual)}
                  estadoBadge={badgeServicioText}
                  badgeBg={badgeServicioBg}
                  badgeColor={badgeServicioColor}
                  seleccionado={estaServicioSeleccionado(servicio.id)}
                  onToggle={checked => setServiciosSeleccionados(prev => ({ ...prev, [servicio.id]: checked }))}
                  meses={mesesS}
                  onMesesChange={val => setMesesPorServicio(prev => ({ ...prev, [servicio.id]: val }))}
                  subtotal={subtotalS}
                  periodoDetalle={detalleServicio}
                />
              );
            })}

            {serviciosActivos.length === 0 && (
              <div style={{ fontSize: 12.5, color: C.textWarm, fontStyle: 'italic', padding: '6px 4px' }}>
                No hay servicios adicionales configurados para tu fraccionamiento.
              </div>
            )}
          </div>

          {/* ── Summary & Checkout Card ── */}
          {totalBaseCheckout > 0 && (
            <div style={{ background: '#fff', borderRadius: 24, padding: 22, boxShadow: '0 8px 26px rgba(120,90,30,.09)' }}>
              <div style={{ fontFamily: FB, fontSize: 17, fontWeight: 800, color: C.green, marginBottom: 12 }}>
                Resumen de pago
              </div>

              {/* Subtotal base rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: C.textMain }}>
                {incluirAgua && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Agua ({mesesAgua} {mesesAgua === 1 ? 'mes' : 'meses'})</span>
                    <span style={{ fontWeight: 700 }}>${montoBaseAgua.toFixed(2)}</span>
                  </div>
                )}
                {serviciosActivos
                  .filter(s => estaServicioSeleccionado(s.id))
                  .map(s => {
                    const count = mesesPorServicio[s.id] || 1;
                    const sub = calcularSubtotalServicio(s, count);
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{s.nombre} ({count} {count === 1 ? 'mes' : 'meses'})</span>
                        <span style={{ fontWeight: 700 }}>${sub.toFixed(2)}</span>
                      </div>
                    );
                  })}

                <div style={{ height: 1, background: C.border3, margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>Total base fraccionamiento</span>
                  <span>${totalBaseCheckout.toFixed(2)} MXN</span>
                </div>
              </div>

              {/* Collapsible breakdown */}
              {desgloseCheckout && (
                <>
                  <button
                    type="button"
                    onClick={() => setBreakdownOpen(v => !v)}
                    aria-expanded={breakdownOpen}
                    aria-controls="desglose-cargos"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '12px 0 0', cursor: 'pointer', color: '#C98A0E', fontFamily: FM, fontSize: 13, fontWeight: 700 }}
                  >
                    Ver desglose
                    <Chevron up={breakdownOpen} color="#C98A0E" />
                  </button>

                  {breakdownOpen && (
                    <div id="desglose-cargos" style={{ marginTop: 10, fontSize: 13 }}>
                      <p style={{ fontSize: 12, color: '#A07040', marginBottom: 10, lineHeight: 1.4 }}>
                        Mercado Pago cobra una comisión por procesar pagos con tarjeta. Los cargos se incluyen en el total para que tu fraccionamiento reciba el monto completo.
                      </p>
                      {breakdown.map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#6A6450' }}>
                          <span>{row.label}</span>
                          <span style={{ fontWeight: 700 }}>{row.value}</span>
                        </div>
                      ))}
                      <div style={{ height: 1, background: C.border3, margin: '8px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: C.green, fontWeight: 800, fontSize: 14 }}>
                        <span>Total a pagar</span>
                        <span>${totalCheckout.toFixed(2)} MXN</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* MP button */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={pagando || !puedePagarConTarjeta}
                aria-busy={pagando}
                style={{
                  width: '100%', marginTop: 16,
                  background: pagando ? '#D4A017' : C.gold,
                  color: '#5A3D06', border: 'none', borderRadius: 18,
                  padding: 17, cursor: pagando || !puedePagarConTarjeta ? 'not-allowed' : 'pointer',
                  fontFamily: FB, fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: '0 10px 22px rgba(244,178,35,.34)',
                  opacity: pagando || !puedePagarConTarjeta ? 0.8 : 1,
                  transition: 'opacity .15s',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A3D06" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>
                </svg>
                {pagando ? 'Redirigiendo a Mercado Pago...' : `Pagar $${totalCheckout.toFixed(2)} con Mercado Pago`}
              </button>

              {error && (
                <div role="alert" aria-live="assertive" style={{ marginTop: 10, background: C.pendingBg, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.pendingText, fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <div style={{ textAlign: 'center', fontSize: 11.5, color: C.textWarm3, marginTop: 9 }}>
                Pago seguro procesado por Mercado Pago
              </div>
            </div>
          )}

          {/* ── Payment history ── */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '18px 18px 4px', boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
            <div style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: C.textMain, marginBottom: 10 }}>
              Historial de pagos
            </div>

            {historyItems.length === 0 ? (
              <div style={{ padding: '24px 0 20px', textAlign: 'center' }}>
                <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenBg, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                  <LogoMark size={34} />
                </span>
                <p style={{ fontSize: 14, color: C.textWarm2, fontWeight: 600 }}>Aún no tienes pagos registrados</p>
                <p style={{ fontSize: 12, color: C.textWarm3, marginTop: 4 }}>Tu historial aparecerá aquí una vez que realices tu primer pago.</p>
              </div>
            ) : (
              <div role="list" aria-label="Historial de pagos">
                {historyItems.map((p, i) => (
                  <div
                    key={p.id}
                    role="listitem"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: i < historyItems.length - 1 ? `1px solid ${C.border2}` : 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CheckCircle2 size={32} color={C.green2} style={{ flexShrink: 0 }} aria-hidden="true" />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.textMain }}>{MESES[p.mes - 1]} {p.anio}</div>
                        <div style={{ fontSize: 12, color: C.textWarm2, marginTop: 2 }}>
                          {p.esReconexion ? 'Cuota + reconexión' : 'Cuota mensual'}
                          {p.folio && ` · ${p.folio}`}
                        </div>
                        {p.fechaPago && (
                          <div style={{ fontSize: 11, color: C.textWarm3 }}>{formatFecha(p.fechaPago)}</div>
                        )}
                      </div>
                    </div>
                    <span aria-label={`Monto al fraccionamiento: $${p.montoBase ?? p.monto} MXN`} style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.textMain }}>
                      ${p.montoBase ?? p.monto}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: C.textWarm3, lineHeight: 1.5, paddingBottom: 4 }}>
            SISCO · Sistema Integral de Servicios para la Comunidad
          </div>
        </div>
      </div>
    </div>
  );
}
