'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import Image from 'next/image';

const C = {
  green:    '#15493A',
  bg:       '#F0EEE6',
  border:   '#D8D4C8',
  textMain: '#1F2A22',
  textMute: '#8A8879',
  danger:   '#C0453F',
  dangerBg: '#FBEAE9',
  ok:       '#3D7A52',
  okBg:     '#E7F2EA',
} as const;

const FM = "var(--font-manrope), 'Manrope', sans-serif";
const FS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', borderRadius: 12,
  border: `1.5px solid ${C.border}`,
  fontSize: 14, fontFamily: FM, color: C.textMain, background: '#fff',
  outline: 'none', transition: 'border-color .15s, box-shadow .15s',
};

const labelBase: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: C.textMain, fontFamily: FM, marginBottom: 5,
};

const btnGreen: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 13,
  background: C.green, color: '#fff', border: 'none',
  fontFamily: FM, fontSize: 14, fontWeight: 700, cursor: 'pointer',
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: C.bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '20px 16px', fontFamily: FM,
};

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 400, background: '#fff',
  borderRadius: 24, overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.06)',
};

function HeaderBlock({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ background: C.green, padding: '30px 28px 24px', textAlign: 'center' }}>
      <div style={{ width: 68, height: 68, borderRadius: 18, overflow: 'hidden', background: '#fff', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Image src="/logo1SIS4S.png" alt="SIS4S Logo" width={60} height={60} style={{ objectFit: 'contain' }} priority />
      </div>
      <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.62)', marginTop: 5 }}>{subtitle}</div>
    </div>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState(false);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      setLoading(false);
      return;
    }
    try {
      if (!token) throw new Error('Token no válido');
      await authClient.resetPassword({ newPassword: password, token });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al restablecer la contraseña');
    }
    setLoading(false);
  }

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <HeaderBlock title="SIS4S" subtitle="Sistema de Agua" />
          <div style={{ padding: '26px 28px 28px', textAlign: 'center' }}>
            <div style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: C.danger, fontWeight: 600, marginBottom: 18 }}>
              Enlace de recuperación inválido o expirado.
            </div>
            <button onClick={() => router.push('/login')}
              style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 13, padding: '11px 24px', fontFamily: FM, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Volver al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <style>{`.rp-inp:focus { border-color: #15493A !important; box-shadow: 0 0 0 3px rgba(21,73,58,.12) !important; }`}</style>
      <div style={cardStyle}>
        <HeaderBlock title="Restablecer contraseña" subtitle="Ingresa tu nueva contraseña" />
        <div style={{ padding: '26px 28px 28px' }}>
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
            <div>
              <label htmlFor="rp-password" style={labelBase}>Nueva contraseña</label>
              <input id="rp-password" type="password" className="rp-inp"
                placeholder="••••••••" autoComplete="new-password" required minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                style={inputBase} />
            </div>
            <div>
              <label htmlFor="rp-confirm" style={labelBase}>Confirmar contraseña</label>
              <input id="rp-confirm" type="password" className="rp-inp"
                placeholder="••••••••" autoComplete="new-password" required minLength={8}
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                style={inputBase} />
            </div>

            {error && (
              <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 600 }}>
                {error}
              </div>
            )}
            {success && (
              <div role="alert" style={{ background: C.okBg, border: '1px solid #B0DFC0', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: C.ok, fontWeight: 600 }}>
                ✓ Contraseña restablecida. Redirigiendo al login...
              </div>
            )}

            <button type="submit" disabled={loading || success}
              style={{ ...btnGreen, opacity: (loading || success) ? 0.75 : 1 }}>
              {loading ? 'Guardando...' : 'Restablecer contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#F0EEE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "var(--font-manrope),'Manrope',sans-serif", color: '#8A8879', fontSize: 14 }}>
        Cargando...
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
