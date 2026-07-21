'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useAuth';
import { useActualizarEstadoAgua } from '@/hooks/useResidente';
import { trpcReact } from '@/lib/trpc-react';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bgOuter:    '#F0EEE6',
  bgHeader:   '#15493A',
  headerCard: '#0F3B2D',
  card:       '#fff',
  cardBorder: '#E4E1D5',
  textMain:   '#1F2A22',
  textMuted:  '#8A8879',
  gold:       '#F4B223',
  goldLight:  '#F8C84E',
  danger:     '#C0453F',
  dangerBg:   '#FBEAE9',
  ok:         '#4C9B62',
  okBg:       '#E7F2EA',
  alertBg:    '#FEF3CD',
  alertText:  '#7A5800',
};

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

type FilterType = 'todos' | 'corte' | 'reconexion';

type ResidenteJob = {
  id: string;
  usuario?: { name: string } | null;
  circuito?: { nombre: string } | null;
  edificio: string;
  departamento: string;
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, background: C.headerCard, borderRadius: 14, padding: 12 }}>
      <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#9FC2AC', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? C.gold : '#fff',
        color:      active ? C.bgHeader : '#6C7268',
        border:     active ? 'none' : '1px solid #DEDACB',
        borderRadius: 20, padding: '8px 14px',
        fontSize: 12.5, fontWeight: 700, fontFamily: FM, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

interface JobCardProps {
  job:       ResidenteJob;
  tipo:      'corte' | 'reconexion';
  procesando: boolean;
  onAction:  () => void;
}

function JobCard({ job, tipo, procesando, onAction }: JobCardProps) {
  const isCorte = tipo === 'corte';
  const color   = isCorte ? C.danger : C.ok;
  const badgeBg = isCorte ? C.dangerBg : C.okBg;
  const label   = isCorte ? 'Corte' : 'Reconexión';
  const desc    = isCorte
    ? 'Falta de pago — corte físico pendiente'
    : 'Pagó reconexión — reconexión física pendiente';
  const btnLabel = procesando
    ? 'Procesando...'
    : isCorte ? 'Confirmar corte' : 'Confirmar reconexión';
  const btnBg = procesando ? '#888' : isCorte ? C.danger : C.ok;

  return (
    <div style={{ background: C.card, borderRadius: 18, padding: 15, borderLeft: `3px solid ${color}`, boxShadow: '0 4px 14px rgba(20,40,30,.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: C.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.usuario?.name ?? 'Sin nombre'}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {job.circuito?.nombre ?? ''} · Edif. {job.edificio}, Depto {job.departamento}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 20, background: badgeBg, color, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {label}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 }}>
        <span style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>{desc}</span>
        <button
          onClick={onAction}
          disabled={procesando}
          aria-busy={procesando}
          style={{
            background: btnBg, color: '#fff', border: 'none', borderRadius: 12,
            padding: '8px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: FM,
            cursor: procesando ? 'not-allowed' : 'pointer', flexShrink: 0,
            opacity: procesando ? 0.7 : 1,
          }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function TrabajadorDashboard() {
  const router  = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [filter, setFilter]       = useState<FilterType>('todos');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const cortesQ      = trpcReact.cortes.pendientesDeCorte.useQuery();
  const reconexionesQ = trpcReact.cortes.pendientesDeReconexion.useQuery();
  const { confirmarCorte, confirmarReconexion } = useActualizarEstadoAgua();

  const cargando           = sessionPending || cortesQ.isLoading || reconexionesQ.isLoading;
  const pendientesCorte    = (cortesQ.data ?? []) as ResidenteJob[];
  const pendientesReconexion = (reconexionesQ.data ?? []) as ResidenteJob[];
  const total              = pendientesCorte.length + pendientesReconexion.length;

  async function handleCorte(perfilId: string) {
    setProcesando(perfilId);
    setError(null);
    try {
      await confirmarCorte({ perfilId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar corte');
    } finally {
      setProcesando(null);
    }
  }

  async function handleReconexion(perfilId: string) {
    setProcesando(perfilId);
    setError(null);
    try {
      await confirmarReconexion({ perfilId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar reconexión');
    } finally {
      setProcesando(null);
    }
  }

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  // Derive initials + shift date
  const nombre   = session?.user?.name ?? '';
  const initials = nombre.trim().split(/\s+/).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || 'OP';
  const hoy      = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  // Apply filter
  const corteItems    = pendientesCorte.map(j => ({ job: j, tipo: 'corte' as const }));
  const reconexItems  = pendientesReconexion.map(j => ({ job: j, tipo: 'reconexion' as const }));
  const visibleJobs =
    filter === 'corte'      ? corteItems :
    filter === 'reconexion' ? reconexItems :
    [...corteItems, ...reconexItems];

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: C.bgOuter, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM }}>
        <div style={{ color: '#9FC2AC', fontSize: 15, fontWeight: 600 }}>Cargando turno...</div>
      </div>
    );
  }

  return (
    <div className="cuad-outer" style={{ minHeight: '100vh', background: C.bgOuter, display: 'flex', justifyContent: 'center', fontFamily: FM, color: C.textMain }}>
      <style>{`
        @media(min-width:680px){
          .cuad-outer{align-items:flex-start;padding-top:48px;padding-bottom:80px}
          .cuad-inner{border-radius:32px;overflow:hidden;box-shadow:0 24px 64px rgba(20,40,30,.18)}
        }
      `}</style>
      <div className="cuad-inner" style={{ width: '100%', maxWidth: 460, paddingBottom: 32 }}>

        {/* ── Dark green header ── */}
        <div style={{ background: C.bgHeader, padding: '18px 20px 20px' }}>

          {/* Brand + avatar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bgHeader} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />
                </svg>
              </span>
              <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '.02em' }}>Cuadrilla SIS4S</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => router.push('/residente')}
                aria-label="Ir a inicio"
                style={{ background: C.headerCard, border: 'none', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', color: '#9FC2AC', fontSize: 12, fontWeight: 700, fontFamily: FM }}
              >
                Inicio
              </button>
              <button
                onClick={salir}
                aria-label="Cerrar sesión"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9FC2AC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/>
                </svg>
              </button>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.headerCard, color: C.goldLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: FS }}>
                {initials}
              </span>
            </div>
          </div>

          {/* Shift label + stat cards */}
          <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#B9D6C4' }}>
            Turno de hoy · {hoy}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <StatCard value={pendientesCorte.length}    label="Cortes pendientes" color="#fff" />
            <StatCard value={pendientesReconexion.length} label="Reconexiones"     color={C.gold} />
            <StatCard value={total}                     label="Total en turno"    color="#8FD19E" />
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '16px 14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {error && (
            <div role="alert" aria-live="assertive" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <FilterBtn active={filter === 'todos'}     onClick={() => setFilter('todos')}     label={`Todos (${total})`} />
            <FilterBtn active={filter === 'corte'}     onClick={() => setFilter('corte')}     label={`Corte (${pendientesCorte.length})`} />
            <FilterBtn active={filter === 'reconexion'} onClick={() => setFilter('reconexion')} label={`Reconexión (${pendientesReconexion.length})`} />
          </div>

          {/* Job list */}
          {visibleJobs.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 18, padding: '32px 20px', textAlign: 'center', boxShadow: '0 4px 14px rgba(20,40,30,.06)' }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.okBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ok} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l4 4 10-11"/>
                </svg>
              </span>
              <p style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>
                {filter === 'corte' ? 'Sin cortes pendientes' : filter === 'reconexion' ? 'Sin reconexiones pendientes' : 'Sin trabajo pendiente'}
              </p>
            </div>
          ) : (
            <div role="list" aria-label="Lista de trabajos pendientes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleJobs.map(({ job, tipo }) => (
                <div key={`${tipo}-${job.id}`} role="listitem">
                  <JobCard
                    job={job}
                    tipo={tipo}
                    procesando={procesando === job.id}
                    onAction={() => tipo === 'corte' ? handleCorte(job.id) : handleReconexion(job.id)}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 11, color: '#A6A399', marginTop: 6, lineHeight: 1.5, paddingBottom: 4 }}>
            SIS4S · Panel de Cuadrilla
          </div>
        </div>
      </div>
    </div>
  );
}
