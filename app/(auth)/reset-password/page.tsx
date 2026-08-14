'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc-client';
import {
  filterRepresentativeResetCodeInput,
  isRepresentativeResetCodeValid,
  REPRESENTATIVE_RESET_CODE_LENGTH,
} from '@/src/domain/usuarios/representative-reset-code';
import { AuthCard, C, inputBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

function ResetPasswordContent() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleRequestCode() {
    const normalizedEmail = email.trim().toLowerCase();
    setRequestMessage('');
    setRequestError('');

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      setRequestError('Introduce un correo electrónico válido');
      return;
    }

    setRequestingCode(true);
    try {
      await trpc.usuarios.solicitarCodigoRecuperacion.mutate({ email: normalizedEmail });
      setRequestMessage(
        'Si el correo corresponde a un residente activo, su representante ya puede generar el código.',
      );
    } catch {
      setRequestError('No se pudo registrar la solicitud. Intenta de nuevo más tarde.');
    } finally {
      setRequestingCode(false);
    }
  }

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
    if (!isRepresentativeResetCodeValid(code)) {
      setError('El código debe contener exactamente 6 dígitos');
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
      subtitle="Solicita el código y después úsalo para elegir una nueva contraseña"
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
            maxLength={254}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setRequestMessage('');
              setRequestError('');
            }}
            style={inputBase}
          />
          <button
            type="button"
            onClick={handleRequestCode}
            disabled={requestingCode || !email.trim()}
            style={{
              width: '100%', marginTop: 9, minHeight: 42, borderRadius: 12,
              border: `1.5px solid ${C.gold}`, background: '#fff', color: C.textWarm,
              fontFamily: FM, fontSize: 13, fontWeight: 800,
              cursor: requestingCode || !email.trim() ? 'not-allowed' : 'pointer',
              opacity: requestingCode || !email.trim() ? 0.65 : 1,
            }}
          >
            {requestingCode ? 'Solicitando...' : 'Solicitar código al representante'}
          </button>
          {requestMessage && (
            <p role="status" aria-live="polite" style={{ fontSize: 12, color: C.ok, marginTop: 7, lineHeight: 1.45, fontWeight: 700 }}>
              {requestMessage}
            </p>
          )}
          {requestError && (
            <p role="alert" style={{ fontSize: 12, color: C.danger, marginTop: 7, lineHeight: 1.45, fontWeight: 700 }}>
              {requestError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="rp-code" style={labelBase}>Código del representante</label>
          <input
            id="rp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            className="auth-inp"
            placeholder="123456"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={REPRESENTATIVE_RESET_CODE_LENGTH}
            maxLength={REPRESENTATIVE_RESET_CODE_LENGTH}
            value={code}
            onChange={e => setCode(filterRepresentativeResetCodeInput(e.target.value))}
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
