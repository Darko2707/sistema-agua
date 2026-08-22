'use client';

import { useMemo, useState } from 'react';
import { trpcReact } from '@/lib/trpc-react';
import { MESES_CORTO as MESES } from '@/lib/meses';
import { MAX_MESES_POR_PAGO_TESORERA } from '@/src/domain/pagos/periodos-tesoreria';
import { userFacingError } from '@/lib/user-facing-error';

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
type AccionDisponible = 'pagar_atrasados' | 'pagar_actual' | 'adelantar';
type TipoPeriodo = 'atrasado' | 'actual' | 'adelantado';
type EstadoPeriodo = 'pagado' | 'disponible' | 'bloqueado';
type MesAnio = { mes: number; anio: number };
type PeriodoPago = MesAnio & { tipo: TipoPeriodo; estado: EstadoPeriodo };
type ResidentePago = {
  id: string;
  edificio: string;
  departamento: string;
  estadoAgua: string;
  pagoEsteMes: boolean;
  accionDisponible: AccionDisponible;
  atrasadosPendientes: number;
  periodos: PeriodoPago[];
  usuario?: { id?: string; name?: string | null; email?: string | null };
};

const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ACCION_LABEL: Record<AccionDisponible, string> = {
  pagar_atrasados: 'Pagar atrasados',
  pagar_actual:    'Pagar mes actual',
  adelantar:       'Adelantar pago',
};

const TIPO_LABEL: Record<TipoPeriodo, string> = {
  atrasado:   'Atrasados',
  actual:     'Mes actual',
  adelantado: 'Adelantados',
};

function compararPeriodos(a: MesAnio, b: MesAnio) {
  return a.anio - b.anio || a.mes - b.mes;
}

function periodoKey(periodo: MesAnio) {
  return `${periodo.anio}-${periodo.mes}`;
}

function etiquetaPeriodo(periodo: MesAnio) {
  return `${MESES_FULL[periodo.mes - 1]} ${periodo.anio}`;
}

function detalleEstadoPeriodo(periodo: PeriodoPago, accion: AccionDisponible) {
  if (periodo.estado === 'pagado') return 'Pagado ✓';
  if (periodo.estado === 'disponible') return 'Disponible';
  return accion === 'pagar_atrasados'
    ? 'Primero cubre atrasados'
    : 'Primero paga el mes actual';
}

export function PagosTesorera() {
  const [filtro,      setFiltro]      = useState<Filtro>('pendientes');
  const [busqueda,    setBusqueda]    = useState('');
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [toast,       setToast]       = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);
  const [modalPago, setModalPago] = useState<{ residenteId: string } | null>(null);
  const [metodoSel, setMetodoSel] = useState<MetodoPago>('efectivo');
  const [mesesSel, setMesesSel] = useState<MesAnio[]>([]);

  const utils    = trpcReact.useUtils();
  const query    = trpcReact.pagos.listarResidentesParaPago.useQuery();
  const mutation = trpcReact.pagos.registrarManualTesorera.useMutation({
    onSuccess: () => {
      void utils.reportes.reporteFinanciero.invalidate();
    },
    onSettled: () => {
      void utils.pagos.listarResidentesParaPago.invalidate();
    },
  });

  const circuito   = query.data?.circuito;
  const residentes = useMemo(() => query.data?.residentes ?? [], [query.data?.residentes]);
  const cargando   = query.isLoading;
  const periodoActual = query.data?.periodoActual;
  const residenteModal = modalPago
    ? residentes.find(residente => residente.id === modalPago.residenteId) ?? null
    : null;
  const periodosModal = residenteModal
    ? [...residenteModal.periodos].sort(compararPeriodos)
    : [];
  const periodosDisponiblesModal = new Set(
    periodosModal
      .filter(periodo => periodo.estado === 'disponible')
      .map(periodoKey),
  );
  const mesesSeleccionados = mesesSel.filter(periodo => periodosDisponiblesModal.has(periodoKey(periodo)));

  function abrirModal(residente: ResidentePago) {
    const primeroDisponible = [...residente.periodos]
      .filter(periodo => periodo.estado === 'disponible')
      .sort(compararPeriodos)[0];
    if (!primeroDisponible) {
      mostrar('No hay periodos disponibles para registrar', 'error');
      return;
    }
    setModalPago({ residenteId: residente.id });
    setMetodoSel('efectivo');
    setMesesSel(primeroDisponible
      ? [{ mes: primeroDisponible.mes, anio: primeroDisponible.anio }]
      : []);
  }

  function toggleMes(periodo: PeriodoPago) {
    if (periodo.estado !== 'disponible') return;
    setMesesSel(prev => {
      const vigentes = prev.filter(mes => periodosDisponiblesModal.has(periodoKey(mes)));
      const existe = vigentes.some(mes => periodoKey(mes) === periodoKey(periodo));
      if (existe) return vigentes.filter(mes => periodoKey(mes) !== periodoKey(periodo));
      if (vigentes.length >= MAX_MESES_POR_PAGO_TESORERA) {
        mostrar(`Puedes registrar como máximo ${MAX_MESES_POR_PAGO_TESORERA} meses a la vez`, 'error');
        return vigentes;
      }
      return [...vigentes, { mes: periodo.mes, anio: periodo.anio }];
    });
  }

  async function registrar() {
    if (!residenteModal || mesesSeleccionados.length === 0) return;
    setRegistrando(residenteModal.id);
    try {
      const res = await mutation.mutateAsync({
        perfilId: residenteModal.id,
        metodo: metodoSel,
        meses: [...mesesSeleccionados].sort(compararPeriodos),
      });
      setModalPago(null);
      setMesesSel([]);
      const registrados = res.registrados;
      const folios = res.folios.filter(Boolean);
      const resumenFolios = folios.length > 0
        ? ` · ${folios.length === 1 ? 'Folio' : 'Folios'}: ${folios.join(', ')}`
        : '';
      const resumenOmitidos = res.omitidos.length > 0
        ? ` · Ya pagados: ${res.omitidos.join(', ')}`
        : '';
      mostrar(
        `${registrados} ${registrados === 1 ? 'mes registrado' : 'meses registrados'}${resumenFolios}${resumenOmitidos}`,
        'ok',
      );
    } catch (e: unknown) {
      await utils.pagos.listarResidentesParaPago.invalidate();
      mostrar(userFacingError(e, 'SIS4S-202'), 'error');
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
    return filtro === 'pendientes'
      ? base.filter(r => r.accionDisponible !== 'adelantar')
      : base;
  }, [residentes, busqueda, filtro]);

  if (cargando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', fontFamily: FM }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${C.greenLight}`, borderTopColor: C.green, borderRadius: '50%', animation: 'tes-spin 0.8s linear infinite' }} />
        <style>{`@keyframes tes-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 16, padding: '20px 22px', color: C.danger, fontFamily: FM }}>
        <div style={{ fontWeight: 800 }}>No se pudieron cargar los pagos.</div>
        <div style={{ marginTop: 4, fontSize: 13 }}>Revisa tu conexión e inténtalo de nuevo.</div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          style={{ marginTop: 12, border: `1px solid ${C.danger}`, background: '#fff', color: C.danger, borderRadius: 10, padding: '8px 13px', fontWeight: 800, cursor: 'pointer' }}
        >
          Reintentar
        </button>
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

  const pagadosEsteMes = residentes.filter(r => r.pagoEsteMes).length;
  const pendientes = residentes.filter(r => r.accionDisponible !== 'adelantar').length;

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
              {periodoActual ? `${MESES[periodoActual.mes - 1]} ${periodoActual.anio}` : 'Mes actual'} · Cuota ${circuito.montoMensual} · Reconexión ${circuito.montoReconexion}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FS, fontSize: 26, fontWeight: 800, color: C.greenText }}>{pagadosEsteMes}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>Mes actual pagado</div>
            </div>
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: FS, fontSize: 26, fontWeight: 800, color: '#D97706' }}>{pendientes}</div>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>Requieren cobro</div>
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
                      Mes actual pagado ✓
                    </span>
                  )}

                  {r.atrasadosPendientes > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: C.goldBg, color: '#8A5A00' }}>
                      {r.atrasadosPendientes} {r.atrasadosPendientes === 1 ? 'mes atrasado' : 'meses atrasados'}
                    </span>
                  )}

                  {r.estadoAgua !== 'pendiente_reconexion' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {r.estadoAgua === 'cortado' && (
                        <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>
                          +${Number(circuito.montoReconexion).toFixed(0)} reconexión
                        </span>
                      )}
                      {!r.periodos.some(periodo => periodo.estado === 'disponible') && (
                        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700 }}>
                          Sin periodos disponibles
                        </span>
                      )}
                      <ActionBtn
                        label={ACCION_LABEL[r.accionDisponible]}
                        loading={registrando === r.id}
                        disabled={!!registrando || !r.periodos.some(periodo => periodo.estado === 'disponible')}
                        danger={r.estadoAgua === 'cortado'}
                        onClick={() => abrirModal(r)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalPago && residenteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-pago-tesorera"
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
          onClick={e => { if (e.target === e.currentTarget && !registrando) setModalPago(null); }}
        >
          <div style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 18, padding: 20, boxShadow: '0 22px 70px rgba(0,0,0,.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <h2 id="titulo-pago-tesorera" style={{ fontFamily: FS, fontSize: 18, color: C.green, fontWeight: 800 }}>
                  {ACCION_LABEL[residenteModal.accionDisponible]}
                </h2>
                <p style={{ marginTop: 4, color: C.textMuted, fontSize: 13 }}>
                  {residenteModal.usuario?.name ?? 'Sin nombre'} · Edif. {residenteModal.edificio} · Depto {residenteModal.departamento}
                </p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setModalPago(null)} disabled={!!registrando} style={{ border: 'none', background: C.greenLight, color: C.green, borderRadius: 10, width: 34, height: 34, cursor: registrando ? 'not-allowed' : 'pointer', fontWeight: 800 }}>×</button>
            </div>

            <fieldset disabled={!!registrando} style={{ marginTop: 16, padding: 0, border: 0 }}>
              <legend style={{ marginBottom: 7, color: C.textMain, fontSize: 12, fontWeight: 800 }}>
                Método de pago
              </legend>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['efectivo', 'transferencia'] as const).map(metodo => {
                  const activo = metodoSel === metodo;
                  return (
                    <label
                      key={metodo}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        border: activo ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                        background: activo ? C.greenLight : '#fff', color: activo ? C.green : C.textMain,
                        borderRadius: 12, minHeight: 42, padding: '8px 12px', cursor: registrando ? 'not-allowed' : 'pointer',
                        fontSize: 13, fontWeight: 800,
                      }}
                    >
                      <input
                        type="radio"
                        name="metodo-pago-tesorera"
                        value={metodo}
                        checked={activo}
                        onChange={() => setMetodoSel(metodo)}
                        style={{ accentColor: C.green }}
                      />
                      {metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
              {(['atrasado', 'actual', 'adelantado'] as const).map(tipo => {
                const periodos = periodosModal.filter(periodo => periodo.tipo === tipo);
                if (periodos.length === 0) return null;
                return (
                  <section key={tipo} aria-labelledby={`grupo-periodos-${tipo}`}>
                    <h3 id={`grupo-periodos-${tipo}`} style={{ marginBottom: 7, color: C.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                      {TIPO_LABEL[tipo]}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                      {periodos.map(periodo => {
                        const selected = mesesSeleccionados.some(mes => periodoKey(mes) === periodoKey(periodo));
                        const disabled = periodo.estado !== 'disponible' || !!registrando;
                        const color = tipo === 'atrasado' ? '#B45309' : tipo === 'actual' ? C.green : '#2563EB';
                        const detalle = detalleEstadoPeriodo(periodo, residenteModal.accionDisponible);
                        return (
                          <button
                            key={periodoKey(periodo)}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            aria-label={`${etiquetaPeriodo(periodo)}, ${detalle}`}
                            onClick={() => toggleMes(periodo)}
                            style={{
                              minHeight: 58, borderRadius: 12,
                              border: selected ? `2px solid ${color}` : `1px solid ${C.border}`,
                              background: selected ? '#F8FAF7' : periodo.estado === 'disponible' ? '#fff' : '#F4F3EF',
                              color: periodo.estado === 'disponible' ? C.textMain : C.textMuted,
                              cursor: disabled ? 'not-allowed' : 'pointer', opacity: periodo.estado === 'disponible' ? 1 : .72,
                              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: '8px 10px',
                            }}
                          >
                            <span style={{ fontWeight: 800, fontSize: 13 }}>{etiquetaPeriodo(periodo)}</span>
                            <span style={{ color: periodo.estado === 'disponible' ? color : C.textMuted, fontSize: 10.5, fontWeight: 800 }}>
                              {detalle}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: C.textMuted, fontSize: 13, fontWeight: 700 }}>
                {mesesSeleccionados.length} {mesesSeleccionados.length === 1 ? 'mes seleccionado' : 'meses seleccionados'} · máximo {MAX_MESES_POR_PAGO_TESORERA}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setModalPago(null)} disabled={!!registrando} style={{ border: `1px solid ${C.border}`, background: '#fff', color: C.textMain, borderRadius: 10, padding: '9px 14px', fontWeight: 800, cursor: registrando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
                <button type="button" onClick={registrar} disabled={!!registrando || mesesSeleccionados.length === 0} style={{ border: 'none', background: C.green, color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 800, cursor: registrando || mesesSeleccionados.length === 0 ? 'not-allowed' : 'pointer', opacity: registrando || mesesSeleccionados.length === 0 ? .65 : 1 }}>
                  {registrando ? 'Registrando...' : `Registrar ${mesesSeleccionados.length || ''} ${mesesSeleccionados.length === 1 ? 'mes' : 'meses'}`.trim()}
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
