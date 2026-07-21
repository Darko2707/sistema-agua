'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/hooks/useAuth';
import { trpcReact } from '@/lib/trpc-react';
import { PagosTesorera } from '@/components/tesorera/PagosTesorera';
import { ReporteResidentes } from '@/components/representante/ReporteResidentes';
import { ReporteFinanciero } from '@/components/representante/ReporteFinanciero';

type TabId = 'pagos' | 'residentes' | 'financiero';

const C = {
  bgHeader:   '#15493A',
  headerCard: '#0F3B2D',
  gold:       '#F4B223',
  bg:         '#F0EEE6',
};

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

const TABS: { id: TabId; label: string }[] = [
  { id: 'pagos',      label: 'Registrar Pagos' },
  { id: 'residentes', label: 'Residentes'       },
  { id: 'financiero', label: 'Financiero'        },
];

export default function TesoreraReportesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [tab, setTab] = useState<TabId>('pagos');
  const circuitoQuery = trpcReact.circuitos.miCircuitoTesorera.useQuery();

  const nombre   = session?.user?.name ?? '';
  const initials = nombre.trim().split(/\s+/).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || 'TE';

  async function salir() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: FM, color: '#3A3528' }}>

      {/* ── Header ── */}
      <div style={{ background: C.bgHeader, position: 'sticky', top: 0, zIndex: 20 }}>

        {/* Top bar */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bgHeader} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </span>
            <div>
              <div style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                Tesorera — SIS4S
              </div>
              {circuitoQuery.data?.nombre && (
                <div style={{ fontSize: 11.5, color: '#9FC2AC', marginTop: 1 }}>
                  {circuitoQuery.data.nombre}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => router.push('/residente')}
              style={{ background: C.headerCard, border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: '#9FC2AC', fontSize: 12, fontWeight: 700, fontFamily: FM }}
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
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: C.headerCard, color: '#F8C84E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: FS }}>
              {initials}
            </span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 18px',
                fontFamily: FM, fontSize: 13, fontWeight: 700,
                color: tab === t.id ? C.gold : '#9FC2AC',
                borderBottom: `3px solid ${tab === t.id ? C.gold : 'transparent'}`,
                whiteSpace: 'nowrap',
                transition: 'color .15s, border-color .15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 20px 48px' }}>
        {tab === 'pagos'      && <PagosTesorera />}
        {tab === 'residentes' && <ReporteResidentes />}
        {tab === 'financiero' && <ReporteFinanciero />}
      </div>
    </div>
  );
}
