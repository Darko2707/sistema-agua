'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc-client';
import { MESES_FULL as MESES } from '@/lib/meses';

// ── Design tokens (warm) ──────────────────────────────────────────────────────
const C = {
  bg:       '#F4EEE0',
  header:   '#FBF6EB',
  green:    '#15493A',
  greenDark:'#15623A',
  gold:     '#F4B223',
  textWarm: '#9A8E72',
  textWarm2:'#A89A7C',
  textWarm3:'#B0A488',
  textMain: '#3A3528',
  green2:   '#5E7D2A',
  greenBg:  '#E6F1E5',
  border:   '#F2EAD8',
  border2:  '#F4EEDF',
  border3:  '#EFE3CC',
  pendingBg:'#FBEAE9',
  pendingText:'#C62B27',
};

const FM = "var(--font-mulish), 'Mulish', sans-serif";
const FB = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────
type Ticket = {
  id: string;
  folio: string;
  emitidoEn: string | Date | null;
  pago?: {
    mes: number;
    anio: number;
    monto: string;
    estado: string | null;
    montoBase: string | null;
    comisionMercadoPago: string | null;
    retencionIsr: string | null;
    retencionIva: string | null;
    circuito?: { nombre: string } | null;
    perfil?: {
      edificio: string;
      departamento: string;
      usuario?: { name: string } | null;
    } | null;
  } | null;
};

function formatFechaCort(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const PULSE: React.CSSProperties = {
  background: '#EDE5CF',
  borderRadius: 10,
  animation: 'sis4s-pulse 1.6s ease-in-out infinite',
};

function Skeleton() {
  return (
    <div role="status" aria-label="Cargando recibos"
      style={{ minHeight: '100vh', background: C.bg, display: 'flex', justifyContent: 'center', fontFamily: FM }}>
      <style>{`@keyframes sis4s-pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
      <div style={{ width: '100%', maxWidth: 460, paddingBottom: 48 }}>
        <div style={{ background: C.header, padding: '18px 22px 26px', borderRadius: '0 0 36px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
            <div style={{ ...PULSE, width: 38, height: 38, borderRadius: '50%' }} />
            <div style={{ ...PULSE, width: 100, height: 22 }} />
          </div>
          <div style={{ ...PULSE, width: 200, height: 13, marginTop: 10, marginLeft: 52 }} />
        </div>
        <div style={{ padding: '18px 14px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', gap: 9 }}>
            <div style={{ ...PULSE, width: 70, height: 38, borderRadius: 30 }} />
            <div style={{ ...PULSE, width: 70, height: 38, borderRadius: 30 }} />
          </div>
          <div style={{ ...PULSE, height: 88, borderRadius: 22 }} />
          <div style={{ background: '#fff', borderRadius: 22, padding: '8px 20px', boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', borderBottom: i < 4 ? `1px solid ${C.border2}` : 'none' }}>
                <div style={{ ...PULSE, width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...PULSE, width: 110, height: 14, marginBottom: 6 }} />
                  <div style={{ ...PULSE, width: 80, height: 11 }} />
                </div>
                <div style={{ ...PULSE, width: 55, height: 14 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FoliosPage() {
  const router = useRouter();
  const [tickets, setTickets]     = useState<Ticket[]>([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    trpc.tickets.misTickets
      .query()
      .then((data) => {
        const t = data as Ticket[];
        setTickets(t);
        // Default to latest year in tickets
        const years = t.map(tk => tk.pago?.anio).filter(Boolean) as number[];
        if (years.length > 0) setSelectedYear(Math.max(...years));
      })
      .catch(() => setError('No se pudieron cargar tus recibos'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Skeleton />;

  // Derive available years
  const allYears = [...new Set(
    tickets.map(t => t.pago?.anio).filter(Boolean) as number[]
  )].sort((a, b) => b - a);
  if (allYears.length === 0) allYears.push(new Date().getFullYear());

  const ticketsFiltrados = tickets.filter(t => t.pago?.anio === selectedYear);
  const totalPagado = ticketsFiltrados
    .reduce((sum, t) => sum + Number(t.pago?.monto ?? 0), 0)
    .toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  // Account info from first ticket
  const firstPago = tickets[0]?.pago;
  const cuenta = firstPago?.perfil
    ? `${firstPago.perfil.edificio}, ${firstPago.perfil.departamento}`
    : '';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', justifyContent: 'center', fontFamily: FM, color: C.textMain }}>
      <style>{`
        @keyframes sis4s-glow{0%,100%{opacity:.55}50%{opacity:.85}}
        @media(min-width:680px){
          .sis4s-outer{background:#E8E2D2!important;align-items:flex-start;padding-top:48px;padding-bottom:80px}
          .sis4s-inner-f{border-radius:32px;background:#F4EEE0;box-shadow:0 24px 64px rgba(120,90,30,.16)}
          .sis4s-header-f{border-radius:32px 32px 36px 36px!important}
        }
      `}</style>
      <div className="sis4s-inner-f" style={{ width: '100%', maxWidth: 460, paddingBottom: 48 }}>

        {/* Header */}
        <div className="sis4s-header-f" style={{ position: 'relative', background: C.header, padding: '18px 22px 26px', borderRadius: '0 0 36px 36px' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit', zIndex: 0 }}>
            <div style={{ position: 'absolute', top: -70, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,#F8C84E 0%,rgba(248,200,78,0) 68%)', opacity: 0.65, animation: 'sis4s-glow 5s ease-in-out infinite' }} />
          </div>

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
            <button
              onClick={() => router.push('/residente')}
              aria-label="Volver al inicio"
              style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', border: `1px solid ${C.border3}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 3px 10px rgba(120,90,30,.10)', flexShrink: 0 }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.greenDark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div style={{ fontFamily: FB, fontSize: 22, fontWeight: 800, color: C.green }}>Recibos</div>
          </div>
          {cuenta && (
            <div style={{ position: 'relative', zIndex: 1, fontSize: 13, color: '#8C7E62', marginTop: 6, fontWeight: 600, marginLeft: 52 }}>
              {cuenta} · Historial
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '18px 14px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {error && (
            <div role="alert" style={{ background: C.pendingBg, border: '1px solid #F3BFBF', borderRadius: 16, padding: '12px 16px', fontSize: 13, color: C.pendingText, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Year filter */}
          <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 2 }}>
            {allYears.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                style={{
                  background: selectedYear === y ? C.greenDark : '#fff',
                  color: selectedYear === y ? '#fff' : '#8C7E62',
                  border: selectedYear === y ? 'none' : `1px solid ${C.border3}`,
                  borderRadius: 30,
                  padding: '9px 18px',
                  fontFamily: FB,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Total paid card */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '18px 20px', boxShadow: '0 8px 24px rgba(120,90,30,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12.5, color: C.textWarm, fontWeight: 700 }}>Total pagado en {selectedYear}</div>
              <div style={{ fontFamily: FB, fontSize: 28, fontWeight: 800, color: C.green, marginTop: 3 }}>{totalPagado}</div>
            </div>
            <span style={{ width: 46, height: 46, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.green2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 2v4M16 2v4M4 10h16" />
              </svg>
            </span>
          </div>

          {/* Receipts list */}
          {ticketsFiltrados.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 22, padding: '32px 20px', textAlign: 'center', boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.green2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/>
                </svg>
              </span>
              <p style={{ fontSize: 14, color: C.textWarm2, fontWeight: 600 }}>Sin recibos para {selectedYear}</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 22, padding: '8px 20px', boxShadow: '0 6px 18px rgba(120,90,30,.07)' }}>
              <div role="list" aria-label="Lista de recibos">
                {ticketsFiltrados.map((ticket, i) => {
                  const p = ticket.pago;
                  const periodo = p ? `${MESES[p.mes - 1]} ${p.anio}` : 'Sin periodo';
                  const fecha = formatFechaCort(ticket.emitidoEn);
                  return (
                    <div
                      key={ticket.id}
                      role="listitem"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: i < ticketsFiltrados.length - 1 ? `1px solid ${C.border2}` : 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                        <span style={{ width: 38, height: 38, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green2} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l4 4 10-11" />
                          </svg>
                        </span>
                        <div>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textMain }}>{periodo}</div>
                          <div style={{ fontSize: 12, color: C.textWarm2, marginTop: 1 }}>
                            Folio {ticket.folio}{fecha ? ` · ${fecha}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span aria-label={`Monto: ${p?.monto}`} style={{ fontFamily: FB, fontSize: 14.5, fontWeight: 700, color: C.green }}>
                          ${p?.monto ?? '0.00'}
                        </span>
                        <a
                          href={`/api/tickets/${ticket.folio}/pdf`}
                          download={`recibo-${ticket.folio}.pdf`}
                          aria-label={`Descargar recibo ${ticket.folio}`}
                          style={{ width: 32, height: 32, borderRadius: '50%', background: C.header, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C98A0E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 11, color: C.textWarm3, lineHeight: 1.5, paddingBottom: 4 }}>
            SIS4S · Sistema Integral de Servicios 4 Soles
          </div>
        </div>
      </div>
    </div>
  );
}
