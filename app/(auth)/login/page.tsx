'use client';

import { signIn, authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard, C, inputBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: signInError } = await signIn.email({ email, password });
      if (signInError) {
        setError(signInError.message ?? 'Correo o contraseña incorrectos');
        setLoading(false);
        return;
      }
      const session = await authClient.getSession();
      const rol = (session?.data?.user as { role?: string })?.role ?? 'residente';
      localStorage.setItem('userRole', rol);
      if (rol === 'admin') router.push('/admin');
      else if (rol === 'representante') router.push('/representante');
      else if (rol === 'cuadrilla_cortes') router.push('/trabajador');
      else router.push('/residente');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    setResetError('');
    setResetSent(false);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, redirectTo: '/reset-password' }),
      });
      if (res.ok) {
        setResetSent(true);
        setResetEmail('');
        setTimeout(() => {
          setShowReset(false);
          setResetSent(false);
        }, 5000);
      } else {
        const data = await res.json() as { error?: string };
        setResetError(data.error ?? 'Error al enviar el correo de recuperación');
      }
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Error al enviar el correo');
    }
    setResetLoading(false);
  }

  return (
    <AuthCard
      title={showReset ? 'Recuperar contraseña' : 'Iniciar sesión'}
      subtitle={showReset ? 'Te enviaremos un enlace de recuperación' : 'Ingresa tus credenciales para acceder al sistema'}
      footer={(
        <>
          ¿No tienes cuenta?{' '}
          <button type="button" className="auth-link" style={linkButton} onClick={() => router.push('/registro')}>
            Regístrate
          </button>
        </>
      )}
    >
      {!showReset ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
          <div>
            <label htmlFor="login-email" style={labelBase}>Correo electrónico</label>
            <input
              id="login-email"
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
            <label htmlFor="login-pwd" style={labelBase}>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-pwd"
                type={showPwd ? 'text' : 'password'}
                className="auth-inp"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...inputBase, paddingRight: 44 }}
              />
              <button
                type="button"
                aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPwd(v => !v)}
                style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.textWarm, display: 'flex', alignItems: 'center', padding: 0 }}
              >
                {showPwd
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700, fontFamily: FM }}>
              {error}
            </div>
          )}

          <button className="auth-primary" type="submit" disabled={loading} style={{ ...buttonGold, opacity: loading ? 0.75 : 1, marginTop: 2 }}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button type="button" className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} onClick={() => setShowReset(true)}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
          <div>
            <label htmlFor="reset-email" style={labelBase}>Correo electrónico</label>
            <input
              id="reset-email"
              type="email"
              className="auth-inp"
              placeholder="tu@correo.com"
              autoComplete="email"
              required
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              style={inputBase}
            />
            <p style={{ fontSize: 12, color: C.textWarm, marginTop: 5, lineHeight: 1.4 }}>
              Te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>

          {resetError && (
            <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700 }}>
              {resetError}
            </div>
          )}
          {resetSent && (
            <div role="alert" style={{ background: C.okBg, border: '1px solid #B0DFC0', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.ok, fontWeight: 700 }}>
              ✓ Correo enviado. Revisa tu bandeja de entrada.
            </div>
          )}

          <button className="auth-primary" type="submit" disabled={resetLoading} style={{ ...buttonGold, opacity: resetLoading ? 0.75 : 1 }}>
            {resetLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="auth-link"
              style={{ ...linkButton, color: '#C98A0E' }}
              onClick={() => {
                setShowReset(false);
                setResetError('');
                setResetSent(false);
              }}
            >
              ‹ Volver al inicio de sesión
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
