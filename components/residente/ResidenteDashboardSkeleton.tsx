import type { CSSProperties } from 'react';

const PULSE: CSSProperties = {
  animation: 'sis4s-pulse 1.6s ease-in-out infinite',
  borderRadius: 10,
  background: '#EDE5CF',
};

export function ResidenteDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando panel de residente"
      style={{ minHeight: '100vh', background: '#F4EEE0', display: 'flex', justifyContent: 'center' }}
    >
      <style>{`@keyframes sis4s-pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
      <div style={{ width: '100%', maxWidth: 460, paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ background: '#FBF6EB', padding: '18px 22px 26px', borderRadius: '0 0 36px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ ...PULSE, width: 48, height: 48, borderRadius: '50%' }} />
              <div>
                <div style={{ ...PULSE, width: 68, height: 18, marginBottom: 8 }} />
                <div style={{ ...PULSE, width: 110, height: 11 }} />
              </div>
            </div>
            <div style={{ ...PULSE, width: 82, height: 42, borderRadius: 30 }} />
          </div>
          <div style={{ marginTop: 22 }}>
            <div style={{ ...PULSE, width: 180, height: 28, marginBottom: 10 }} />
            <div style={{ ...PULSE, width: 220, height: 13 }} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 14px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Payment card */}
          <div style={{ background: '#fff', borderRadius: 26, padding: 22, boxShadow: '0 10px 28px rgba(120,90,30,.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ ...PULSE, width: 120, height: 18, marginBottom: 8 }} />
                <div style={{ ...PULSE, width: 90, height: 12 }} />
              </div>
              <div style={{ ...PULSE, width: 80, height: 28, borderRadius: 30 }} />
            </div>
            <div style={{ ...PULSE, borderRadius: 18, height: 100 }} />
            <div style={{ ...PULSE, width: '100%', height: 54, borderRadius: 18, marginTop: 14 }} />
          </div>

          {/* Status card */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13, boxShadow: '0 6px 18px rgba(120,90,30,.05)' }}>
            <div style={{ ...PULSE, width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
            <div>
              <div style={{ ...PULSE, width: 110, height: 15, marginBottom: 8 }} />
              <div style={{ ...PULSE, width: 80, height: 12 }} />
            </div>
          </div>

          {/* History card */}
          <div style={{ background: '#fff', borderRadius: 22, padding: '18px 18px', boxShadow: '0 6px 18px rgba(120,90,30,.05)' }}>
            <div style={{ ...PULSE, width: 140, height: 16, marginBottom: 16 }} />
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 3 ? '1px solid #F4EEDF' : 'none' }}
              >
                <div style={{ ...PULSE, width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...PULSE, width: 100, height: 14, marginBottom: 6 }} />
                  <div style={{ ...PULSE, width: 70, height: 11 }} />
                </div>
                <div style={{ ...PULSE, width: 55, height: 15 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
