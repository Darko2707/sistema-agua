'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthCard, C, inputBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
      <AuthCard title="Restablecer contraseña" subtitle="El enlace no es válido o expiró">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '12px 16px', fontSize: 14, color: C.danger, fontWeight: 700 }}>
            Enlace de recuperación inválido o expirado.
          </div>
          <button className="auth-primary" onClick={() => router.push('/login')} style={buttonGold}>
            Volver al inicio de sesión
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Restablecer contraseña" subtitle="Ingresa tu nueva contraseña">
      <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <div>
          <label htmlFor="rp-password" style={labelBase}>Nueva contraseña</label>
          <input
            id="rp-password"
            type="password"
            className="auth-inp"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputBase}
          />
        </div>
        <div>
          <label htmlFor="rp-confirm" style={labelBase}>Confirmar contraseña</label>
          <input
            id="rp-confirm"
            type="password"
            className="auth-inp"
            placeholder="••••••••"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            style={inputBase}
          />
        </div>

        {error && (
          <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>
            {error}
          </div>
        )}
        {success && (
          <div role="alert" style={{ background: C.okBg, border: '1px solid #B0DFC0', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.ok, fontWeight: 700 }}>
            ✓ Contraseña restablecida. Redirigiendo al login...
          </div>
        )}

        <button className="auth-primary" type="submit" disabled={loading || success} style={{ ...buttonGold, opacity: (loading || success) ? 0.75 : 1 }}>
          {loading ? 'Guardando...' : 'Restablecer contraseña'}
        </button>

        <div style={{ textAlign: 'center' }}>
          <button type="button" className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} onClick={() => router.push('/login')}>
            ‹ Volver al inicio de sesión
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM, color: C.textWarm, fontSize: 14 }}>
        Cargando...
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
