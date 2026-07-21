'use client';

import { useState } from 'react';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export interface ExcelRangoModalProps {
  open:       boolean;
  onClose:    () => void;
  mesActual:  number;
  anioActual: number;
  titulo?:    string;
  subtitulo?: string;
  onExportar: (desde: { mes: number; anio: number }, hasta: { mes: number; anio: number }) => Promise<void>;
}

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

const SEL: React.CSSProperties = {
  height: 38, borderRadius: 10, border: '1.5px solid #E4E1D5',
  background: '#fff', fontSize: 13, paddingLeft: 10, paddingRight: 10,
  outline: 'none', color: '#3A3528', fontFamily: FM, cursor: 'pointer',
};

export function ExcelRangoModal({
  open, onClose, mesActual, anioActual,
  titulo = 'Exportar Excel',
  subtitulo = 'Selecciona el rango de meses a incluir en el reporte.',
  onExportar,
}: ExcelRangoModalProps) {
  const hoy       = new Date();
  const aniosOpts = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);

  const [mesDesde,   setMesDesde]   = useState(mesActual);
  const [anioDesde,  setAnioDesde]  = useState(anioActual);
  const [mesHasta,   setMesHasta]   = useState(mesActual);
  const [anioHasta,  setAnioHasta]  = useState(anioActual);
  const [exportando, setExportando] = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  if (!open) return null;

  const desdeNum    = anioDesde * 100 + mesDesde;
  const hastaNum    = anioHasta * 100 + mesHasta;
  const rangoValido = hastaNum >= desdeNum;
  const periodosLabel = desdeNum === hastaNum
    ? `${MESES[mesDesde - 1]} ${anioDesde}`
    : `${MESES[mesDesde - 1]} ${anioDesde} — ${MESES[mesHasta - 1]} ${anioHasta}`;

  async function handleExportar() {
    if (!rangoValido) { setErrMsg('El mes de inicio debe ser anterior o igual al mes de fin'); return; }
    setExportando(true);
    setErrMsg('');
    try {
      await onExportar({ mes: mesDesde, anio: anioDesde }, { mes: mesHasta, anio: anioHasta });
      onClose();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Error al generar Excel');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)', padding: 16 }}
      onClick={onClose}
    >
      <style>{`@keyframes exr-spin{to{transform:rotate(360deg)}}`}</style>
      <div
        style={{ background: '#fff', borderRadius: 22, padding: '26px 28px', width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: FS, fontSize: 17, fontWeight: 800, color: '#1F2A22' }}>{titulo}</div>
          <div style={{ fontSize: 13, color: '#8A8879', marginTop: 4, fontFamily: FM }}>{subtitulo}</div>
        </div>

        {errMsg && (
          <div role="alert" style={{ background: '#FBEAE9', border: '1px solid #F3BFBF', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#C0453F', fontWeight: 600, marginBottom: 16, fontFamily: FM }}>
            {errMsg}
          </div>
        )}

        {/* Desde */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8A8879', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7, fontFamily: FM }}>Desde</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...SEL, flex: 1 }} value={mesDesde} onChange={e => setMesDesde(parseInt(e.target.value, 10))}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select style={{ ...SEL, width: 88 }} value={anioDesde} onChange={e => setAnioDesde(parseInt(e.target.value, 10))}>
              {aniosOpts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Hasta */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8A8879', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7, fontFamily: FM }}>Hasta</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...SEL, flex: 1 }} value={mesHasta} onChange={e => setMesHasta(parseInt(e.target.value, 10))}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select style={{ ...SEL, width: 88 }} value={anioHasta} onChange={e => setAnioHasta(parseInt(e.target.value, 10))}>
              {aniosOpts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Preview */}
        {rangoValido ? (
          <div style={{ background: '#E6F2ED', border: '1px solid #C8DECE', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#2E7A5A', fontWeight: 600, marginBottom: 22, fontFamily: FM }}>
            Reporte: {periodosLabel}
          </div>
        ) : (
          <div style={{ background: '#FEF7E6', border: '1px solid #F0D080', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#7A5800', fontWeight: 600, marginBottom: 22, fontFamily: FM }}>
            El mes de inicio debe ser anterior al mes de fin.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={exportando}
            style={{ background: '#fff', border: '1.5px solid #E4E1D5', borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: exportando ? 'not-allowed' : 'pointer', color: '#6C7268', fontFamily: FM }}
          >
            Cancelar
          </button>
          <button
            onClick={handleExportar}
            disabled={exportando || !rangoValido}
            style={{
              background: exportando || !rangoValido ? '#ccc' : '#15493A',
              color: '#fff', border: 'none', borderRadius: 12, padding: '9px 20px',
              fontSize: 13, fontWeight: 700, cursor: exportando || !rangoValido ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, fontFamily: FM,
            }}
          >
            {exportando
              ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'exr-spin .7s linear infinite' }} aria-hidden="true" />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            }
            Descargar Excel
          </button>
        </div>
      </div>
    </div>
  );
}
