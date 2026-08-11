'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import { AuthCard, C, inputBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

function ResetPasswordContent() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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
      await trpc.usuarios.restablecerConCodigoRepresentante.mutate({
        email:       email.trim().toLowerCase(),
        code,
        newPassword: password,
      });
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
      setCode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al restablecer la contraseña');
    }
    setLoading(false);
  }

  return (
    <AuthCard
      title="Restablecer contraseña"
      subtitle="Usa el código de 6 dígitos que te dio tu representante"
    >
      <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <div>
          <label htmlFor="rp-email" style={labelBase}>Correo electrónico</label>
          <input
            id="rp-email"
            type="email"
            className="auth-inp"
            placeholder="tu@correo.com"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputBase}
          />
        </div>
        <div>
          <label htmlFor="rp-code" style={labelBase}>Código del representante</label>
          <input
            id="rp-code"
            inputMode="numeric"
            pattern="[0-9 ]*"
            className="auth-inp"
            placeholder="123456"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={8}
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 8))}
            style={{ ...inputBase, letterSpacing: '0.16em', fontWeight: 800, textAlign: 'center' }}
          />
          <p style={{ fontSize: 12, color: C.textWarm, marginTop: 5, lineHeight: 1.4 }}>
            El código caduca 10 minutos después de generarse y solo se puede usar una vez.
          </p>
        </div>
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
          <div role="status" aria-live="polite" style={{ background: C.okBg, border: '1px solid #B0DFC0', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.ok, fontWeight: 700 }}>
            ✓ Contraseña restablecida. Ya puedes iniciar sesión.
          </div>
        )}

        <button className="auth-primary" type="submit" disabled={loading || success} style={{ ...buttonGold, opacity: (loading || success) ? 0.75 : 1 }}>
          {loading ? 'Guardando...' : 'Restablecer contraseña'}
        </button>

        <div style={{ textAlign: 'center' }}>
          <Link className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} href="/login">
            ‹ Volver al inicio de sesión
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div role="status" aria-live="polite" style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FM, color: C.textWarm, fontSize: 14 }}>
        Cargando...
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
