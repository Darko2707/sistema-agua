'use client';

import { useState, useMemo } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import { MESES_CORTO as MESES } from '@/lib/meses';

const C = {
  green:      '#15493A',
  greenDark:  '#0F3B2D',
  greenLight: '#E6F2ED',
  greenText:  '#2E7A5A',
  gold:       '#F4B223',
  goldBg:     '#FEF7E6',
  danger:     '#C0453F',
  dangerBg:   '#FBEAE9',
  card:       '#fff',
  border:     '#E4E1D5',
  textMain:   '#3A3528',
  textMuted:  '#8A8879',
  bg:         '#F0EEE6',
};

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

type Filtro = 'todos' | 'pendientes';
type MetodoPago = 'efectivo' | 'transferencia';
type PeriodoPago = { mes: number; anio: number; tipo: 'atrasado' | 'actual' | 'adelantado'; label: string };
type ResidentePago = {
  id: string;
  edificio: string;
  departamento: string;
  estadoAgua: string;
  pagoEsteMes: boolean;
  usuario?: { id?: string; name?: string | null; email?: string | null };
};

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function generarPeriodosPago(): PeriodoPago[] {
  const now = new Date();
  return Array.from({ length: 25 }, (_, index) => {
    const offset = index - 12;
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const mes = d.getMonth() + 1;
    const anio = d.getFullYear();
    return {
      mes,
      anio,
      tipo: offset < 0 ? 'atrasado' : offset === 0 ? 'actual' : 'adelantado',
      label: `${MESES_FULL[mes - 1]} ${anio}`,
    };
  });
}

const PERIODOS_PAGO = generarPeriodosPago();

export function PagosTesorera() {
  const [filtro,      setFiltro]      = useState<Filtro>('pendientes');
  const [busqueda,    setBusqueda]    = useState('');
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [toast,       setToast]       = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);
  const [modalPago, setModalPago] = useState<{ residente: ResidentePago; metodo: MetodoPago } | null>(null);
  const [mesesSel, setMesesSel] = useState<Array<{ mes: number; anio: number }>>([]);

  const utils    = trpcReact.useUtils();
  const query    = trpcReact.pagos.listarResidentesParaPago.useQuery();
  const mutation = trpcReact.pagos.registrarManualTesorera.useMutation({
    onSuccess: () => {
      void utils.pagos.listarResidentesParaPago.invalidate();
      void utils.reportes.reporteFinanciero.invalidate();
    },
  });

  const circuito   = query.data?.circuito;
  const residentes = useMemo(() => query.data?.residentes ?? [], [query.data?.residentes]);
  const cargando   = query.isLoading;
  const ahora      = new Date();

  function abrirModal(residente: ResidentePago, metodo: MetodoPago) {
    const actual = PERIODOS_PAGO.find(p => p.tipo === 'actual');
    setModalPago({ residente, metodo });
    setMesesSel(actual ? [{ mes: actual.mes, anio: actual.anio }] : []);
  }

  function toggleMes(mes: number, anio: number) {
    setMesesSel(prev => prev.some(m => m.mes === mes && m.anio === anio)
      ? prev.filter(m => !(m.mes === mes && m.anio === anio))
      : [...prev, { mes, anio }]);
  }

  async function registrar() {
    if (!modalPago || mesesSel.length === 0) return;
    setRegistrando(`${modalPago.residente.id}:${modalPago.metodo}`);
    try {
      const res = await mutation.mutateAsync({
        perfilId: modalPago.residente.id,
        metodo: modalPago.metodo,
        meses: mesesSel,
      });
      setModalPago(null);
      setMesesSel([]);
      mostrar(`Pago registrado — folio ${res.folio}`, 'ok');
    } catch (e: unknown) {
      mostrar(e instanceof Error ? e.message : 'No se pudo registrar el pago', 'error');
    } finally {
      setRegistrando(null);
    }
  }

  function mostrar(msg: string, tipo: 'ok' | 'error') {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  }

  const lista = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const base = term
      ? residentes.filter(r =>
          `${r.usuario?.name} ${r.usuario?.email} ${r.edificio} ${r.departamento}`.toLowerCase().includes(term),
        )
      : residentes;
    return filtro === 'pendientes' ? base.filter(r => !r.pagoEsteMes) : base;
  }, [residentes, busqueda, filtro]);

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', fontFamily: FM }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${C.greenLight}`, borderTopColor: C.green, borderRadius: '50%', animation: 'tes-spin 0.8s linear infinite' }} />
        <style>{`@keyframes tes-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!circuito) {
    return (
      <div style={{ background: C.goldBg, border: `1px solid #F0D080`, borderRadius: 16, padding: '20px 22px', color: '#7A5800', fontWeight: 600, fontFamily: FM }}>
        No tienes un circuito asignado. Contacta al administrador.
      </div>
    );
  }

  const pagados   = residentes.filter(r => r.pagoEsteMes).length;
  const pendientes = residentes.length - pagados;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FM }}>
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 50,
            background: toast.tipo === 'ok' ? C.green : C.danger,
            color: '#fff', borderRadius: 14, padding: '12px 18px',
            fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Stats card ── */}
      <div style={{ background: C.card, borderRadius: 20, padding: '18px 22px', border: `1px solid ${C.border}`, boxShadow: '0 4px 16px rgba(20,40,30,.06)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: FS, fontSize: 17, fontWeight: 800, color: C.green }}>
              {circuito.nombre}
            </div>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 3 }}>
              {MESES[ahora.getMonth()]} {ahora.getFullYear()} · Cuota ${circuito.montoMensual} · Reconexión ${circuito.montoReconexion}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FS, fontSize: 26, fontWeight: 800, color: C.greenText }}>{pagados}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>Pagados</div>
            </div>
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FS, fontSize: 26, fontWeight: 800, color: '#D97706' }}>{pendientes}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>Pendientes</div>
            </div>
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FS, fontSize: 26, fontWeight: 800, color: C.textMain }}>{residentes.length}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>Total</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtros + búsqueda ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterBtn active={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')} label={`Pendientes (${pendientes})`} />
          <FilterBtn active={filtro === 'todos'}      onClick={() => setFiltro('todos')}      label={`Todos (${residentes.length})`} />
        </div>

        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar residente o vivienda..."
            style={{
              paddingLeft: 36, paddingRight: 14, height: 38, borderRadius: 12,
              border: `1.5px solid ${C.border}`, background: C.card,
              fontSize: 13, fontFamily: FM, color: C.textMain, outline: 'none', width: '100%', maxWidth: 260,
            }}
          />
        </div>
      </div>

      {/* ── Lista ── */}
      <div style={{ background: C.card, borderRadius: 20, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 4px 16px rgba(20,40,30,.06)' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontFamily: FS, fontSize: 14, fontWeight: 700, color: C.textMain }}>
          {filtro === 'pendientes' ? 'Residentes con pago pendiente' : 'Todos los residentes'}
        </div>

        {lista.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: C.greenLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.greenText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l4 4 10-11"/>
              </svg>
            </span>
            <p style={{ fontSize: 14, color: C.textMuted, fontWeight: 600 }}>
              {filtro === 'pendientes' ? '¡Todos al corriente este mes!' : 'Sin resultados para la búsqueda'}
            </p>
          </div>
        ) : (
          <div>
            {lista.map((r, i) => (
              <div
                key={r.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: i < lista.length - 1 ? `1px solid ${C.border}` : 'none',
                  display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                {/* Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 12, background: r.pagoEsteMes ? C.greenLight : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={r.pagoEsteMes ? C.greenText : C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/><path d="M12 8v4l3 3"/>
                    </svg>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.usuario?.name ?? 'Sin nombre'}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      Edif. {r.edificio} · Depto {r.departamento}
                    </div>
                  </div>
                </div>

                {/* Badges + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {r.estadoAgua && r.estadoAgua !== 'activo' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                      background: r.estadoAgua === 'cortado' ? C.dangerBg : C.goldBg,
                      color: r.estadoAgua === 'cortado' ? C.danger : '#7A5800',
                    }}>
                      {r.estadoAgua === 'cortado' ? 'Cortado' : r.estadoAgua === 'pendiente_corte' ? 'Pte. corte' : 'Pte. reconexión'}
                    </span>
                  )}

                  {r.pagoEsteMes && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: C.greenLight, color: C.greenText }}>
                      Pagado ✓
                    </span>
                  )}

                  {r.estadoAgua !== 'pendiente_reconexion' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {r.estadoAgua === 'cortado' && (
                        <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>
                          +${Number(circuito.montoReconexion).toFixed(0)} reconexión
                        </span>
                      )}
                      <ActionBtn
                        label={r.pagoEsteMes ? 'Adelantar efectivo' : 'Efectivo'}
                        loading={registrando === `${r.id}:efectivo`}
                        disabled={!!registrando}
                        danger={r.estadoAgua === 'cortado'}
                        outline
                        onClick={() => abrirModal(r, 'efectivo')}
                      />
                      <ActionBtn
                        label={r.pagoEsteMes ? 'Adelantar transferencia' : 'Transferencia'}
                        loading={registrando === `${r.id}:transferencia`}
                        disabled={!!registrando}
                        danger={r.estadoAgua === 'cortado'}
                        onClick={() => abrirModal(r, 'transferencia')}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalPago && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
          onClick={e => { if (e.target === e.currentTarget && !registrando) setModalPago(null); }}
        >
          <div style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 18, padding: 20, boxShadow: '0 22px 70px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: FS, fontSize: 18, color: C.green, fontWeight: 800 }}>Registrar pago</h2>
                <p style={{ marginTop: 4, color: C.textMuted, fontSize: 13 }}>
                  {modalPago.residente.usuario?.name ?? 'Sin nombre'} · {modalPago.metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                </p>
              </div>
              <button type="button" onClick={() => setModalPago(null)} disabled={!!registrando} style={{ border: 'none', background: C.greenLight, color: C.green, borderRadius: 10, width: 34, height: 34, cursor: 'pointer', fontWeight: 800 }}>×</button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {PERIODOS_PAGO.map(p => {
                const selected = mesesSel.some(m => m.mes === p.mes && m.anio === p.anio);
                const color = p.tipo === 'atrasado' ? '#B45309' : p.tipo === 'actual' ? C.green : '#2563EB';
                return (
                  <button
                    key={`${p.anio}-${p.mes}`}
                    type="button"
                    onClick={() => toggleMes(p.mes, p.anio)}
                    style={{
                      minHeight: 48, borderRadius: 12, border: selected ? `2px solid ${color}` : `1px solid ${C.border}`,
                      background: selected ? '#F8FAF7' : '#fff', color: C.textMain, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: '8px 10px',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{p.label}</span>
                    <span style={{ color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{p.tipo}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 700 }}>{mesesSel.length} meses seleccionados</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setModalPago(null)} disabled={!!registrando} style={{ border: `1px solid ${C.border}`, background: '#fff', color: C.textMain, borderRadius: 10, padding: '9px 14px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
                <button type="button" onClick={registrar} disabled={!!registrando || mesesSel.length === 0} style={{ border: 'none', background: C.green, color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 800, cursor: registrando ? 'not-allowed' : 'pointer', opacity: registrando ? .65 : 1 }}>
                  {registrando ? 'Registrando...' : 'Registrar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal sub-components ───────────────────────────────────────────────────

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#15493A' : '#fff',
        color:      active ? '#fff'     : '#6C7268',
        border:     active ? 'none'     : '1.5px solid #E4E1D5',
        borderRadius: 20, padding: '8px 16px',
        fontSize: 12.5, fontWeight: 700,
        fontFamily: "var(--font-manrope), 'Manrope', sans-serif",
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function ActionBtn({
  label, loading, disabled, danger, outline, onClick,
}: {
  label:    string;
  loading:  boolean;
  disabled: boolean;
  danger:   boolean;
  outline?: boolean;
  onClick:  () => void;
}) {
  const bg = outline
    ? '#fff'
    : danger ? '#C0453F' : '#15493A';
  const color = outline
    ? danger ? '#C0453F' : '#15493A'
    : '#fff';
  const border = outline
    ? `1.5px solid ${danger ? '#F3BFBF' : '#C8DECE'}`
    : 'none';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      style={{
        background: loading ? '#888' : bg,
        color, border, borderRadius: 10,
        padding: '7px 14px', fontSize: 12.5, fontWeight: 700,
        fontFamily: "var(--font-manrope), 'Manrope', sans-serif",
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {loading && (
        <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.5)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'tes-spin 0.7s linear infinite' }} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
