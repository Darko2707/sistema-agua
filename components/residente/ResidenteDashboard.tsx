'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/hooks/useAuth';
import { useMiHistorial, useCheckoutMP } from '@/hooks/usePagos';
import { ResidenteDashboardSkeleton } from './ResidenteDashboardSkeleton';
import { MESES_FULL as MESES } from '@/lib/meses';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

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
    msg:     'Tu pago está siendo verificado por Mercado Pago. Te notificaremos cuando se confirme.',
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

const ESTADO_LABEL: Record<string, string> = {
  activo:               'Activo',
  pendiente_corte:      'Activo · pendiente de corte',
  cortado:              'Suspendido',
  pendiente_reconexion: 'Pendiente de reconexión',
};

const ESTADO_DOT: Record<string, string> = {
  activo:               '#22C55E',
  pendiente_corte:      C.gold,
  cortado:              C.pendingText,
  pendiente_reconexion: '#3B82F6',
};

const ESTADO_TEXT: Record<string, string> = {
  activo:               C.green2,
  pendiente_corte:      '#C07A28',
  cortado:              C.pendingText,
  pendiente_reconexion: '#1A56DB',
};

const ESTADO_GLOW: Record<string, string> = {
  activo:               '0 0 0 4px #D1FAE5',
  pendiente_corte:      '0 0 0 4px #FBEFCF',
  cortado:              '0 0 0 4px #FCE0E0',
  pendiente_reconexion: '0 0 0 4px #DBEAFE',
};

function formatFecha(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
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
function DropIcon({ size = 22, color = C.green2 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5c3.8 4.6 5.8 7.7 5.8 10.5a5.8 5.8 0 11-11.6 0c0-2.8 2-5.9 5.8-10.5z"/>
    </svg>
  );
}

// ── Check icon ─────────────────────────────────────────────────────────────────
function CheckIcon({ size = 15, color = C.green2 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4 4 10-11"/>
    </svg>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export function ResidenteDashboard() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { data: sessionData, isPending: sessionPending } = useSession();
  const { data: historial, isLoading: historialLoading } = useMiHistorial();
  const { checkout, isPending: pagando, error } = useCheckoutMP();

  const [menuOpen,      setMenuOpen]      = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FM }}>
        <div style={{ background: '#fff', borderRadius: 26, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 10px 28px rgba(120,90,30,.10)' }}>
          <p style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, color: C.textMain, marginBottom: 20 }}>
            No encontramos tu perfil de residente.
          </p>
          <button
            onClick={() => router.push('/registro')}
            style={{ background: C.gold, color: '#5A3D06', border: 'none', borderRadius: 14, padding: '14px 28px', cursor: 'pointer', fontFamily: FB, fontSize: 15, fontWeight: 700 }}
          >
            Completar registro
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
  const totalConCargos  = desgloseVigente?.total ?? '0.00';
  const montoMensual    = Number(perfil.circuito?.montoMensual ?? 50);
  const montoReconexion = Number(perfil.circuito?.montoReconexion ?? 300);
  const esReconexion    = perfil.estadoAgua === 'cortado';

  const userName = sessionData?.user?.name ?? 'Usuario';
  const miRol    = (sessionData?.user?.role as string) ?? 'residente';

  const initials = userName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const periodoActual = `${MESES[mesActual - 1]} ${anioActual}`;

  const pagoReconexion = pagos.find(p => p.esReconexion && p.estado === 'pagado' && p.mes === mesActual && p.anio === anioActual)
    ?? pagos.find(p => p.esReconexion && p.estado === 'pagado');
  const fechaCorteStr = corteActivo?.fechaCorte ? formatFecha(corteActivo.fechaCorte) : null;

  const resultInfo = paymentResult ? PAYMENT_RESULT[paymentResult] : null;

  const estadoLabel    = ESTADO_LABEL[perfil.estadoAgua] ?? perfil.estadoAgua;
  const estadoDot      = ESTADO_DOT[perfil.estadoAgua]   ?? C.gold;
  const estadoTextColor = ESTADO_TEXT[perfil.estadoAgua] ?? C.green2;
  const estadoGlow     = ESTADO_GLOW[perfil.estadoAgua]  ?? '';

  const roleNav =
    miRol === 'representante'   ? { label: 'Representante', path: '/representante' }     :
    miRol === 'tesorera'        ? { label: 'Tesorera-o',    path: '/tesorera/reportes' }  :
    miRol === 'cuadrilla_cortes'? { label: 'Cuadrilla',     path: '/trabajador' }         :
    miRol === 'admin'           ? { label: 'Admin',          path: '/admin' }              :
    null;

  const historyItems = pagos
    .filter(p => p.estado === 'pagado')
    .sort((a, b) => b.anio !== a.anio ? b.anio - a.anio : b.mes - a.mes)
    .slice(0, 6);

  const breakdown = desgloseVigente ? [
    { label: 'Cuota base',                value: `$${montoMensual.toFixed(2)}` },
    ...(esReconexion ? [{ label: 'Cargo de reconexión', value: `$${montoReconexion.toFixed(2)}` }] : []),
    { label: 'Comisión Mercado Pago',     value: `$${desgloseVigente.comisionMercadoPago}` },
    { label: 'Retención ISR (MP)',        value: `$${desgloseVigente.retencionIsr}` },
    { label: 'Retención IVA (MP)',        value: `$${desgloseVigente.retencionIva}` },
  ] : [];

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <div className="sis4s-outer" style={{ minHeight: '100vh', background: C.bg, display: 'flex', justifyContent: 'center', fontFamily: FM, color: C.textMain }}>
      <style>{`
        @keyframes sis4s-glow{0%,100%{opacity:.55}50%{opacity:.85}}
        @media(min-width:680px){
          .sis4s-outer{background:#E8E2D2!important;align-items:flex-start;padding-top:48px;padding-bottom:80px}
          .sis4s-inner{border-radius:32px;background:#F4EEE0;box-shadow:0 24px 64px rgba(120,90,30,.16);overflow:visible!important}
          .sis4s-header{border-radius:32px 32px 36px 36px!important}
        }
      `}</style>
      <div className="sis4s-inner" style={{ width: '100%', maxWidth: 460, paddingBottom: 48 }}>

        {/* ── Post-MP result banner ── */}
        {resultInfo && (
          <div
            ref={announcerRef}
            role="status"
            aria-live="assertive"
            tabIndex={-1}
            style={{ margin: '16px 16px 0', background: resultInfo.bg, borderRadius: 18, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start', outline: 'none' }}
          >
            <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: resultInfo.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <resultInfo.Icon size={18} color={resultInfo.text} aria-hidden="true" />
            </span>
            <p style={{ fontSize: 13, color: resultInfo.text, fontWeight: 600, lineHeight: 1.5 }}>{resultInfo.msg}</p>
          </div>
        )}

        {/* ── Header ── */}
        <div className="sis4s-header" style={{ position: 'relative', background: C.header, padding: '18px 22px 26px', borderRadius: '0 0 36px 36px' }}>
          {/* Sunburst — clipped en su propio layer para no afectar el dropdown */}
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit', zIndex: 0 }}>
            <div style={{ position: 'absolute', top: -80, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle,#F8C84E 0%,rgba(248,200,78,0) 68%)', opacity: 0.65, animation: 'sis4s-glow 5s ease-in-out infinite' }} />
          </div>

          {/* Brand row + avatar */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(120,90,30,.16)' }}>
                <DropIcon size={26} color={C.greenDark} />
              </div>
              <div>
                <div style={{ fontFamily: FB, fontSize: 20, fontWeight: 800, color: C.greenDark, lineHeight: 1 }}>SIS4S</div>
                <div style={{ fontSize: 11, color: C.textWarm, marginTop: 3, fontWeight: 600 }}>Ciudad de los 4 Soles</div>
              </div>
            </div>

            {/* Avatar + dropdown */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Menú de usuario"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1.5px solid ${C.border3}`, borderRadius: 30, padding: '4px 9px 4px 4px', cursor: 'pointer', boxShadow: '0 3px 10px rgba(120,90,30,.10)', outline: 'none' }}
              >
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: C.greenDark, color: C.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, fontFamily: FB }}>
                  {initials}
                </span>
                <Chevron up={menuOpen} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Opciones de cuenta"
                  style={{ position: 'absolute', right: 0, top: 52, width: 216, background: '#fff', borderRadius: 20, boxShadow: '0 18px 46px rgba(120,90,30,.28)', padding: 7, zIndex: 20 }}
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
                  <div style={{ height: 1, background: C.border, margin: '5px 9px' }} />
                  <MenuItem
                    label="Cerrar sesión"
                    icon="logout"
                    danger
                    onClick={() => { setMenuOpen(false); salir(); }}
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
              Tu cuenta de agua · {perfil.edificio}, {perfil.departamento}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '18px 14px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* State alerts */}
          {perfil.estadoAgua === 'cortado' && (
            <div role="alert" style={{ background: C.pendingBg, border: '1px solid #F3BFBF', borderRadius: 20, padding: '15px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#F4A0A0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={18} color="#fff" aria-hidden="true" />
              </span>
              <div>
                <div style={{ fontFamily: FB, fontWeight: 700, fontSize: 15, color: C.pendingText }}>Tu servicio está suspendido</div>
                <div style={{ fontSize: 13, color: '#B5683C', marginTop: 3, lineHeight: 1.5 }}>
                  Paga ${totalConCargos} MXN con tarjeta para reactivarlo (cuota + reconexión + comisiones MP).
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

          {/* ── Payment card ── */}
          <div style={{ background: '#fff', borderRadius: 26, padding: 22, boxShadow: '0 10px 28px rgba(120,90,30,.10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontFamily: FB, fontSize: 18, fontWeight: 700, color: C.green }}>{periodoActual}</div>
                <div style={{ fontSize: 12.5, color: C.textWarm, marginTop: 2, fontWeight: 600 }}>Estado del mes actual</div>
              </div>
              <span
                role="status"
                style={{ background: yaPagoEsteMes ? C.greenBg : C.pendingBg, color: yaPagoEsteMes ? C.green2 : C.pendingText, fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 30 }}
              >
                {yaPagoEsteMes ? 'Pagado ✓' : 'Pendiente'}
              </span>
            </div>

            {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && (
              <>
                {/* Amount box */}
                <div style={{ background: C.header, borderRadius: 18, padding: '16px 18px', marginTop: 14 }}>
                  <div style={{ fontSize: 12.5, color: C.textWarm, fontWeight: 700 }}>
                    {esReconexion ? 'Cuota + reconexión' : 'Cuota mensual'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 5 }}>
                    <span style={{ fontFamily: FB, fontSize: 46, fontWeight: 800, color: C.green, letterSpacing: '-.02em', lineHeight: 1 }}>
                      ${desgloseVigente?.montoBase ?? montoMensual.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.textWarm2 }}>MXN</span>
                  </div>
                  {desgloseVigente && (
                    <div style={{ fontSize: 12.5, color: '#C98A0E', marginTop: 5, fontWeight: 600 }}>
                      Con tarjeta: <strong>${totalConCargos} MXN</strong> · incluye comisiones MP
                    </div>
                  )}

                  {/* Collapsible breakdown */}
                  {desgloseVigente && (
                    <>
                      <button
                        type="button"
                        onClick={() => setBreakdownOpen(v => !v)}
                        aria-expanded={breakdownOpen}
                        aria-controls="desglose-cargos"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer', color: '#C98A0E', fontFamily: FM, fontSize: 13, fontWeight: 700 }}
                      >
                        Ver desglose
                        <Chevron up={breakdownOpen} color="#C98A0E" />
                      </button>

                      {breakdownOpen && (
                        <div id="desglose-cargos" style={{ marginTop: 10, fontSize: 13 }}>
                          <p style={{ fontSize: 12, color: '#A07040', marginBottom: 10, lineHeight: 1.4 }}>
                            Mercado Pago cobra una comisión por procesar pagos con tarjeta. Los cargos se incluyen en el total para que tu circuito reciba el monto completo.
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
                            <span>${totalConCargos} MXN</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* MP button */}
                <button
                  type="button"
                  onClick={() => checkout(esReconexion)}
                  disabled={pagando}
                  aria-busy={pagando}
                  style={{
                    width: '100%', marginTop: 14,
                    background: pagando ? '#D4A017' : C.gold,
                    color: '#5A3D06', border: 'none', borderRadius: 18,
                    padding: 17, cursor: pagando ? 'not-allowed' : 'pointer',
                    fontFamily: FB, fontSize: 15, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    boxShadow: '0 10px 22px rgba(244,178,35,.34)',
                    opacity: pagando ? 0.8 : 1,
                    transition: 'opacity .15s',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A3D06" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>
                  </svg>
                  {pagando ? 'Redirigiendo a Mercado Pago...' : `Pagar $${totalConCargos} con Mercado Pago`}
                </button>

                {error && (
                  <div role="alert" aria-live="assertive" style={{ marginTop: 10, background: C.pendingBg, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.pendingText, fontWeight: 600 }}>
                    {error}
                  </div>
                )}

                <div style={{ textAlign: 'center', fontSize: 11.5, color: C.textWarm3, marginTop: 9 }}>
                  Pago seguro procesado por Mercado Pago
                </div>
              </>
            )}

            {perfil.estadoAgua === 'pendiente_reconexion' && (
              <div style={{ background: C.header, borderRadius: 18, padding: '16px 18px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <Clock size={19} color={C.textWarm} aria-hidden="true" />
                <span style={{ fontSize: 13.5, color: C.textWarm2, fontWeight: 600 }}>
                  Esperando reconexión física por la cuadrilla
                </span>
              </div>
            )}

            {yaPagoEsteMes && (
              <div style={{ background: C.greenBg, borderRadius: 18, padding: '16px 18px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckIcon size={20} />
                <span style={{ fontSize: 14, color: C.green2, fontWeight: 700 }}>¡Ya pagaste este mes! Gracias.</span>
              </div>
            )}
          </div>

          {/* ── Service status ── */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13, boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
            <span style={{ flexShrink: 0, width: 48, height: 48, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
              <DropIcon size={22} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.textMain }}>Servicio de agua</div>
              <div role="status" style={{ fontSize: 12.5, color: estadoTextColor, fontWeight: 700, marginTop: 2 }}>{estadoLabel}</div>
            </div>
            <span style={{ flexShrink: 0, width: 11, height: 11, borderRadius: '50%', background: estadoDot, boxShadow: estadoGlow }} aria-hidden="true" />
          </div>

          {/* ── Payment history ── */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '18px 18px 4px', boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
            <div style={{ fontFamily: FB, fontSize: 16, fontWeight: 700, color: C.textMain, marginBottom: 10 }}>
              Historial de pagos
            </div>

            {historyItems.length === 0 ? (
              <div style={{ padding: '24px 0 20px', textAlign: 'center' }}>
                <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenBg, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                  <DropIcon size={22} />
                </span>
                <p style={{ fontSize: 14, color: C.textWarm2, fontWeight: 600 }}>Aún no tienes pagos registrados</p>
                <p style={{ fontSize: 12, color: C.textWarm3, marginTop: 4 }}>Tu historial aparecerá aquí una vez que realices tu primer pago.</p>
                {!yaPagoEsteMes && perfil.estadoAgua !== 'pendiente_reconexion' && (
                  <button
                    type="button"
                    onClick={() => checkout(esReconexion)}
                    disabled={pagando}
                    aria-busy={pagando}
                    style={{ marginTop: 14, background: C.gold, color: '#5A3D06', border: 'none', borderRadius: 14, padding: '12px 22px', cursor: pagando ? 'not-allowed' : 'pointer', fontFamily: FB, fontSize: 13, fontWeight: 700 }}
                  >
                    Realizar primer pago
                  </button>
                )}
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
                      <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                        <CheckIcon />
                      </span>
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
                    <span aria-label={`Monto: $${p.monto} MXN`} style={{ fontFamily: FB, fontSize: 15, fontWeight: 700, color: C.textMain }}>
                      ${p.monto}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: C.textWarm3, lineHeight: 1.5, paddingBottom: 4 }}>
            SIS4S · Sistema Integral de Servicios 4 Soles
          </div>
        </div>
      </div>
    </div>
  );
}
