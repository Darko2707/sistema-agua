'use client';

import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

export const C = {
  bg: '#F4EEE0',
  shellBg: '#E8E2D2',
  header: '#FBF6EB',
  green: '#15493A',
  greenDk: '#15623A',
  gold: '#F4B223',
  goldHover: '#E9A715',
  inputBg: '#FBF6EB',
  border: '#F2EAD8',
  borderStrong: '#EFE3CC',
  textMain: '#3A3528',
  textWarm: '#9A8E72',
  textWarm2: '#A89A7C',
  danger: '#C0453F',
  dangerBg: '#FBEAE9',
  ok: '#15623A',
  okBg: '#E6F1E5',
  amber: '#8A5800',
  amberBg: '#FFF8E6',
  amberBdr: '#F8D57E',
} as const;

export const FM = "var(--font-mulish), 'Mulish', sans-serif";
export const FB = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

export const inputBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 15px',
  borderRadius: 14,
  border: `1.5px solid ${C.border}`,
  fontSize: 14,
  fontFamily: FM,
  fontWeight: 600,
  color: C.textMain,
  background: C.inputBg,
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s, background .15s',
};

export const selectBase: CSSProperties = {
  ...inputBase,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='%239A8E72' stroke-width='2.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 13px center',
  paddingRight: 38,
};

export const labelBase: CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 800,
  color: C.textMain,
  fontFamily: FM,
  marginBottom: 6,
};

export const buttonGold: CSSProperties = {
  width: '100%',
  padding: '14px 18px',
  borderRadius: 14,
  background: C.gold,
  color: '#5A3D06',
  border: 'none',
  fontFamily: FB,
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 12px 24px rgba(244,178,35,.28)',
};

export const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: FM,
  fontSize: 13,
  fontWeight: 800,
  color: C.greenDk,
  cursor: 'pointer',
};

export function AuthCard({
  title,
  subtitle,
  footer,
  children,
  maxWidth = 420,
}: {
  title: string;
  subtitle: string;
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div className="auth-outer" style={{ minHeight: '100vh', background: C.bg, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px 46px', fontFamily: FM, color: C.textMain }}>
      <style>{`
        @keyframes auth-glow{0%,100%{opacity:.55}50%{opacity:.85}}
        .auth-inp:focus,.auth-sel:focus{border-color:${C.greenDk}!important;box-shadow:0 0 0 3px rgba(21,98,58,.12)!important;background:#fff!important}
        .auth-link:hover{color:#0F3B2D!important}
        .auth-primary:hover{background:${C.goldHover}!important}
        .auth-grid-2{display:grid;grid-template-columns:1fr;gap:14px}
        @media(min-width:560px){.auth-grid-2{grid-template-columns:1fr 1fr}}
        @media(min-width:680px){.auth-outer{background:${C.shellBg}!important;padding-top:45px}.auth-card{border-radius:30px!important;box-shadow:0 24px 64px rgba(120,90,30,.16)!important}}
      `}</style>
      <div className="auth-card" style={{ width: '100%', maxWidth, minHeight: 584, background: '#fff', borderRadius: 28, boxShadow: '0 18px 54px rgba(120,90,30,.13)', overflow: 'hidden' }}>
        <div style={{ position: 'relative', background: '#fff', padding: '42px 30px 24px', textAlign: 'center', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: -84, right: -54, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle,#F8C84E 0%,rgba(248,200,78,0) 68%)', opacity: .7, animation: 'auth-glow 5s ease-in-out infinite' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Image src="/logo2SIS4S.png" alt="SIS4S Logo" width={96} height={96} style={{ objectFit: 'contain', margin: '0 auto 14px' }} priority />
            <h1 style={{ fontFamily: FB, fontSize: 25, fontWeight: 900, color: C.green, lineHeight: 1.12, margin: 0 }}>{title}</h1>
            <p style={{ fontSize: 13.5, color: C.textWarm, margin: '8px 0 0', fontWeight: 700 }}>{subtitle}</p>
          </div>
        </div>
        <div style={{ padding: '0 30px 28px' }}>{children}</div>
        {footer && (
          <div style={{ background: C.header, borderTop: `1px solid ${C.border}`, padding: '18px 24px', textAlign: 'center', fontSize: 13, color: C.textWarm }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
