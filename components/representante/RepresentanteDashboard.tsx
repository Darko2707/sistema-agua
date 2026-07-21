'use client';

import { useState, useMemo } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useAuth';
import { useCircuitoActual } from '@/hooks/useCircuito';
import { trpcReact } from '@/lib/trpc-react';
import { EstadoAguaBadge } from '@/components/domain/EstadoAguaBadge';
import { MESES_CORTO as MESES } from '@/lib/meses';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bgHeader:   '#15493A',
  headerCard: '#0F3B2D',
  gold:       '#F4B223',
  goldLight:  '#F8C84E',
  bg:         '#F0EEE6',
  card:       '#fff',
  border:     '#E4E1D5',
  green:      '#2E7A5A',
  greenLight: '#E6F2ED',
  danger:     '#C0453F',
  dangerBg:   '#FBEAE9',
  textMain:   '#3A3528',
  textMuted:  '#8A8879',
};

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

type TabId = 'residentes' | 'morosos' | 'personal';

const ROL_LABEL: Record<string, string> = {
  tesorera:         'Tesorera/o',
  cuadrilla_cortes: 'Cuadrilla de cortes',
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, color, sub }: { value: string | number; label: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: C.card, borderRadius: 18, padding: '18px 20px', border: `1px solid ${C.border}`, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: FS, fontSize: 28, fontWeight: 800, color: color ?? C.textMain, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Filter / tab button ───────────────────────────────────────────────────────
function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '10px 18px', fontFamily: FM, fontSize: 13, fontWeight: 700,
        color: active ? C.gold : '#9FC2AC',
        borderBottom: `3px solid ${active ? C.gold : 'transparent'}`,
        whiteSpace: 'nowrap', transition: 'color .15s, border-color .15s',
      }}
    >
      {label}
    </button>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
function Btn({
  onClick, disabled, danger, outline, children,
}: {
  onClick: () => void; disabled?: boolean; danger?: boolean; outline?: boolean;
  children: React.ReactNode;
}) {
  const bg = outline ? C.card : danger ? C.danger : C.bgHeader;
  const color = outline ? (danger ? C.danger : C.bgHeader) : '#fff';
  const border = outline ? `1.5px solid ${danger ? '#F3BFBF' : C.border}` : 'none';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#ccc' : bg, color, border, borderRadius: 12,
        padding: '8px 16px', fontSize: 13, fontWeight: 700, fontFamily: FM,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spin({ color = '#fff' }: { color?: string }) {
  return (
    <span style={{ width: 13, height: 13, border: `2px solid ${color}40`, borderTopColor: color, borderRadius: '50%', display: 'inline-block', animation: 'rep-spin .7s linear infinite' }} aria-hidden="true" />
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function RepresentanteDashboard() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [tab, setTab]         = useState<TabId>('residentes');
  const [busqueda, setBusqueda] = useState('');
  const [toast, setToast]     = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);

  const [modalPersonal,     setModalPersonal]     = useState(false);
  const [residenteSelId,    setResidenteSelId]    = useState('');
  const [rolSeleccionado,   setRolSeleccionado]   = useState<'tesorera' | 'cuadrilla_cortes'>('tesorera');
  const [guardandoPersonal, setGuardandoPersonal] = useState(false);
  const [errorPersonal,     setErrorPersonal]     = useState('');
  const [quitando,          setQuitando]          = useState<string | null>(null);

  const circuitoQuery   = useCircuitoActual();
  const resumenQuery    = trpcReact.pagos.resumenMes.useQuery();
  const residentesQuery = trpcReact.usuarios.listarResidentes.useQuery();
  const personalQuery   = trpcReact.usuarios.listarPersonal.useQuery();
  const cambiarRolMut   = trpcReact.usuarios.cambiarRolEnCircuito.useMutation();

  const circuito   = circuitoQuery.data;
  const resumen    = resumenQuery.data;
  const residentes = residentesQuery.data?.items ?? [];
  const personal   = personalQuery.data ?? [];
  const cargando   = sessionPending || circuitoQuery.isLoading || resumenQuery.isLoading || residentesQuery.isLoading;
  const queryError = circuitoQuery.error?.message ?? resumenQuery.error?.message ?? residentesQuery.error?.message ?? null;

  const candidatos = useMemo(
    () => residentes.filter(r => r.usuario?.role === 'residente' && r.usuario?.id),
    [residentes],
  );

  function mostrar(msg: string, tipo: 'ok' | 'error' = 'ok') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  async function agregarPersonal() {
    if (!residenteSelId) return;
    setGuardandoPersonal(true);
    setErrorPersonal('');
    try {
      await cambiarRolMut.mutateAsync({ userId: residenteSelId, rol: rolSeleccionado });
      setModalPersonal(false);
      setResidenteSelId('');
      void residentesQuery.refetch();
      void personalQuery.refetch();
      mostrar(`${ROL_LABEL[rolSeleccionado] ?? rolSeleccionado} asignado correctamente`);
    } catch (e: unknown) {
      setErrorPersonal(e instanceof Error ? e.message : 'No se pudo asignar el rol');
    } finally {
      setGuardandoPersonal(false);
    }
  }

  async function quitarPersonal(userId: string) {
    setQuitando(userId);
    try {
      await cambiarRolMut.mutateAsync({ userId, rol: 'residente' });
      void residentesQuery.refetch();
      void personalQuery.refetch();
      mostrar('Rol removido correctamente');
    } catch (e: unknown) {
      mostrar(e instanceof Error ? e.message : 'No se pudo remover el rol', 'error');
    } finally {
      setQuitando(null);
    }
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  const nombre   = session?.user?.name ?? '';
  const initials = nombre.trim().split(/\s+/).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || 'RE';
  const ahora    = new Date();
  const morosos  = resumen ? resumen.totalDeptos - resumen.pagados : 0;
  const porcentaje = resumen && resumen.totalDeptos > 0
    ? Math.round((resumen.pagados / resumen.totalDeptos) * 100) : 0;
  const recaudado = resumen?.recaudado ?? 0;

  const listaMostrar = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const filtrados = term
      ? residentes.filter(r => `${r.usuario?.name} ${r.usuario?.email} ${r.edificio} ${r.departamento}`.toLowerCase().includes(term))
      : residentes;
    return tab === 'morosos' ? filtrados.filter(r => !r.pagoEsteMes) : filtrados;
  }, [residentes, busqueda, tab]);

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM }}>
        <style>{`@keyframes rep-spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 30, height: 30, border: `3px solid ${C.greenLight}`, borderTopColor: C.bgHeader, borderRadius: '50%', animation: 'rep-spin .8s linear infinite', margin: '0 auto 10px' }} />
          <span style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>Cargando circuito...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: FM, color: C.textMain }}>
      <style>{`@keyframes rep-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 60, background: toast.tipo === 'ok' ? C.bgHeader : C.danger, color: '#fff', borderRadius: 14, padding: '12px 18px', fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background: C.bgHeader, position: 'sticky', top: 0, zIndex: 20 }}>

        {/* Top bar */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bgHeader} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                Representante — SIS4S
              </div>
              {circuito?.nombre && (
                <div style={{ fontSize: 11.5, color: '#9FC2AC', marginTop: 1 }}>
                  Circuito {circuito.nombre} · {MESES[ahora.getMonth()]} {ahora.getFullYear()}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => router.push('/residente')} style={{ background: C.headerCard, border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: '#9FC2AC', fontSize: 12, fontWeight: 700, fontFamily: FM }}>
              Inicio
            </button>
            <button onClick={salir} aria-label="Cerrar sesión" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9FC2AC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/>
              </svg>
            </button>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.headerCard, color: C.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: FS }}>
              {initials}
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 20px', display: 'flex', overflowX: 'auto' }}>
          <TabBtn active={tab === 'residentes'} onClick={() => setTab('residentes')} label={`Residentes (${residentes.length})`} />
          <TabBtn active={tab === 'morosos'}    onClick={() => setTab('morosos')}    label={`Morosos (${morosos})`} />
          <TabBtn active={tab === 'personal'}   onClick={() => setTab('personal')}   label={`Personal (${personal.length})`} />
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 20px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {queryError && (
          <div role="alert" aria-live="polite" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '12px 16px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
            {queryError}
          </div>
        )}

        {/* ── Stats row ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard value={resumen?.totalDeptos ?? 0} label="Departamentos" />
          <StatCard value={resumen?.pagados ?? 0}     label="Pagados este mes" color={C.green} />
          <StatCard value={morosos}                   label="Morosos"          color={morosos > 0 ? C.danger : C.green} />
          <StatCard
            value={`$${recaudado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            label="Recaudado este mes"
            color="#D97706"
          />
        </div>

        {/* ── Progress bar ── */}
        <div style={{ background: C.card, borderRadius: 18, padding: '18px 22px', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMain }}>Avance de cobranza</span>
            <span style={{ fontFamily: FS, fontSize: 14, fontWeight: 800, color: porcentaje >= 80 ? C.green : '#D97706' }}>{porcentaje}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: '#E8E2D2', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: porcentaje >= 80 ? C.bgHeader : '#D97706', width: `${porcentaje}%`, transition: 'width .6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5, color: C.textMuted }}>
            <span>{resumen?.pagados ?? 0} pagados de {resumen?.totalDeptos ?? 0}</span>
            <span>Cuota mensual: <strong style={{ color: C.textMain }}>${circuito?.montoMensual ?? '—'}</strong> · Reconexión: <strong style={{ color: C.danger }}>${circuito?.montoReconexion ?? '—'}</strong></span>
          </div>
        </div>

        {/* ── Tab: Personal ── */}
        {tab === 'personal' && (
          <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: C.textMain }}>Personal del circuito</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Tesorera/o y cuadrilla de cortes de tu circuito</div>
              </div>
              <Btn onClick={() => { setModalPersonal(true); setResidenteSelId(''); setRolSeleccionado('tesorera'); setErrorPersonal(''); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Añadir personal
              </Btn>
            </div>

            {personal.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>No hay personal asignado.<br /><span style={{ fontWeight: 400 }}>Usa el botón "Añadir personal" para designar roles.</span></p>
              </div>
            ) : (
              personal.map((p, i) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', borderBottom: i < personal.length - 1 ? `1px solid ${C.border}` : 'none', flexWrap: 'wrap', gap: 10 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, background: C.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.textMain }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted }}>{p.email}</div>
                      <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: C.greenLight, color: C.green }}>
                        {ROL_LABEL[p.role] ?? p.role}
                      </span>
                    </div>
                  </div>
                  <Btn
                    onClick={() => quitarPersonal(p.id)}
                    disabled={quitando === p.id}
                    danger outline
                  >
                    {quitando === p.id ? <Spin color={C.danger} /> : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    )}
                    Quitar
                  </Btn>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Residentes / Morosos ── */}
        {(tab === 'residentes' || tab === 'morosos') && (
          <div style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: C.textMain }}>
                {tab === 'morosos' ? 'Residentes morosos este mes' : 'Todos los residentes'}
              </div>
              <div style={{ position: 'relative', flex: 1, maxWidth: 340, minWidth: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar residente o vivienda..."
                  aria-label="Buscar residente"
                  style={{
                    paddingLeft: 36, paddingRight: 14, height: 38, borderRadius: 12, width: '100%',
                    border: `1.5px solid ${C.border}`, background: C.bg,
                    fontSize: 13, fontFamily: FM, color: C.textMain, outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* List */}
            {listaMostrar.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>
                  {tab === 'morosos' ? '¡Sin morosos este mes! ✓' : 'No coincide con la búsqueda'}
                </p>
              </div>
            ) : (
              listaMostrar.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '15px 20px', borderBottom: i < listaMostrar.length - 1 ? `1px solid ${C.border}` : 'none',
                    flexWrap: 'wrap', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, background: r.pagoEsteMes ? C.greenLight : '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={r.pagoEsteMes ? C.green : C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/>
                        <path d="M12 8v4l3 3"/>
                      </svg>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.usuario?.name}
                      </div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 1 }}>
                        Edif. {r.edificio} · Depto {r.departamento}
                      </div>
                      {r.tenencia === 'inquilino' && r.nombrePropietario && (
                        <div style={{ fontSize: 11, color: '#92660A', marginTop: 2 }}>
                          Inquilino · Dueño: {r.nombrePropietario}{r.telefonoPropietario ? ` · ${r.telefonoPropietario}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <EstadoAguaBadge estado={r.estadoAgua} />
                    {r.pagoEsteMes && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: C.greenLight, color: C.green }}>
                        Pagado ✓
                      </span>
                    )}
                    {r.estadoAgua === 'activo' && r.esMoroso && !r.pagoEsteMes && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#FEF3CD', color: '#7A5800' }}>
                        Moroso
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Añadir personal ── */}
      {modalPersonal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)', padding: 16 }}
          onClick={() => setModalPersonal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: FS, fontSize: 17, fontWeight: 800, color: C.textMain }}>Añadir personal</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Circuito {circuito?.nombre}</div>
              </div>
              <button onClick={() => setModalPersonal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.textMuted }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Cerrar"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6 }}>ROL</label>
                <select
                  value={rolSeleccionado}
                  onChange={e => setRolSeleccionado(e.target.value as 'tesorera' | 'cuadrilla_cortes')}
                  style={{ width: '100%', height: 40, borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '0 12px', fontSize: 13, fontFamily: FM, background: '#fff', color: C.textMain }}
                >
                  <option value="tesorera">Tesorera/o</option>
                  <option value="cuadrilla_cortes">Cuadrilla de cortes</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 6 }}>RESIDENTE DEL CIRCUITO</label>
                <select
                  value={residenteSelId}
                  onChange={e => setResidenteSelId(e.target.value)}
                  style={{ width: '100%', height: 40, borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '0 12px', fontSize: 13, fontFamily: FM, background: '#fff', color: C.textMain }}
                >
                  <option value="">Seleccionar residente...</option>
                  {candidatos.map(r => (
                    <option key={r.usuario!.id} value={r.usuario!.id!}>
                      {r.usuario?.name} — Edif. {r.edificio}, Depto {r.departamento}
                    </option>
                  ))}
                </select>
                {candidatos.length === 0 && (
                  <p style={{ marginTop: 6, fontSize: 12, color: '#D97706' }}>No hay residentes disponibles para asignar.</p>
                )}
              </div>

              {errorPersonal && (
                <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
                  {errorPersonal}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <Btn onClick={() => setModalPersonal(false)} outline disabled={guardandoPersonal}>Cancelar</Btn>
              <Btn onClick={agregarPersonal} disabled={!residenteSelId || guardandoPersonal}>
                {guardandoPersonal ? <Spin /> : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                )}
                {guardandoPersonal ? 'Guardando...' : 'Asignar rol'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
