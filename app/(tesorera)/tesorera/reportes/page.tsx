'use client';

import { useState, useRef, useEffect } from 'react';
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
  const [tab, setTab]       = useState<TabId>('pagos');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const circuitoQuery = trpcReact.circuitos.miCircuitoTesorera.useQuery();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Menú de usuario"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.headerCard, border: '1.5px solid rgba(255,255,255,.12)', borderRadius: 30, padding: '4px 9px 4px 4px', cursor: 'pointer' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#0A2E22', color: '#F8C84E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: FS }}>
                {initials}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={menuOpen ? '#F4B223' : '#9FC2AC'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s', transform: menuOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {menuOpen && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 50, width: 210, background: '#fff', borderRadius: 18, boxShadow: '0 16px 40px rgba(0,0,0,.22)', padding: 6, zIndex: 30 }}>
                <div style={{ padding: '10px 14px 9px', borderBottom: '1px solid #E4E1D5', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1F2A22', fontFamily: FS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
                  <div style={{ fontSize: 12, color: '#8A8879', marginTop: 2, fontFamily: FM }}>
                    {circuitoQuery.data?.nombre ? `Circuito ${circuitoQuery.data.nombre}` : 'Tesorera — SIS4S'}
                  </div>
                </div>
                <button role="menuitem" onClick={() => { setMenuOpen(false); router.push('/residente'); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1F2A22', fontFamily: FM, textAlign: 'left' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Inicio
                </button>
                <div style={{ height: 1, background: '#E4E1D5', margin: '4px 9px' }} />
                <button role="menuitem" onClick={() => { setMenuOpen(false); void salir(); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'none', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#C0453F', fontFamily: FM, textAlign: 'left' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/></svg>
                  Cerrar sesión
                </button>
              </div>
            )}
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
