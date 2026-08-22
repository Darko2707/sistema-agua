'use client';

import { signIn, authClient } from '@/lib/auth-client';
import { homePathForRole } from '@/lib/role-home';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  readRememberedLoginEmail,
  writeRememberedLoginEmail,
} from '@/lib/remembered-login';
import { userFacingError } from '@/lib/user-facing-error';
import { AuthCard, C, inputBase, labelBase, buttonGold, linkButton, FM } from '../auth-styles';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberUser, setRememberUser] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    void authClient.getSession()
      .then((result) => {
        if (!active || !result.data?.user) return;
        router.replace(homePathForRole((result.data.user as { role?: string }).role));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!active) return;
        const rememberedEmail = readRememberedLoginEmail();
        if (rememberedEmail) {
          setEmail(rememberedEmail);
          setRememberUser(true);
        }
        setCheckingSession(false);
      });

    return () => { active = false; };
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: signInError } = await signIn.email({
        email: normalizedEmail,
        password,
      });
      if (signInError) {
        setError('SIS4S-401: No pudimos iniciar sesion. El correo o la contrasena no coinciden. Verifica los datos e intenta de nuevo.');
        setLoading(false);
        return;
      }
      writeRememberedLoginEmail(normalizedEmail, rememberUser);
      const session = await authClient.getSession();
      const rol = (session?.data?.user as { role?: string })?.role ?? 'residente';
      router.replace(homePathForRole(rol));
    } catch (err: unknown) {
      setError(userFacingError(err, 'SIS4S-400'));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <AuthCard title="Iniciar sesión" subtitle="Comprobando tu sesión">
        <p role="status" aria-live="polite" style={{ padding: '24px 0', textAlign: 'center', color: C.textWarm, fontWeight: 700 }}>
          Preparando el acceso...
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Iniciar sesión"
      subtitle="Ingresa tus credenciales para acceder al sistema"
      footer={(
        <>
          <div>
            ¿No tienes cuenta?{' '}
            <Link className="auth-link" style={linkButton} href="/registro">
              Regístrate
            </Link>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 12px', marginTop: 10 }}>
            <Link className="auth-link" href="/privacidad" style={{ ...linkButton, fontSize: 12, color: C.textWarm }}>
              Privacidad
            </Link>
            <Link className="auth-link" href="/cookies" style={{ ...linkButton, fontSize: 12, color: C.textWarm }}>
              Cookies
            </Link>
            <Link className="auth-link" href="/terminos" style={{ ...linkButton, fontSize: 12, color: C.textWarm }}>
              Términos
            </Link>
          </div>
        </>
      )}
    >
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="login-email" style={labelBase}>Correo electrónico</label>
            <input
              id="login-email"
              type="email"
              className="auth-inp"
              placeholder="tu@correo.com"
              autoComplete="username"
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
                aria-label={showPwd ? 'Ocultar clave' : 'Mostrar clave'}
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

          <div>
            <label
              htmlFor="remember-user"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                minHeight: 44,
                color: C.textMain,
                cursor: 'pointer',
                fontFamily: FM,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <input
                id="remember-user"
                type="checkbox"
                checked={rememberUser}
                aria-describedby="remember-user-hint"
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRememberUser(checked);
                  if (!checked) writeRememberedLoginEmail(email, false);
                }}
                style={{ width: 18, height: 18, margin: 0, accentColor: C.greenDk, cursor: 'pointer' }}
              />
              Recordar usuario
            </label>
            <p id="remember-user-hint" style={{ margin: '1px 0 0 27px', color: C.textMain, fontFamily: FM, fontSize: 12, lineHeight: 1.4 }}>
              Guarda únicamente tu correo en este dispositivo. Nunca guardamos tu contraseña.
            </p>
          </div>

          {error && (
            <div role="alert" style={{ background: C.dangerBg, border: '1px solid #F3BFBF', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: C.danger, fontWeight: 700, fontFamily: FM }}>
              {error}
            </div>
          )}

          <button className="auth-primary" type="submit" disabled={loading} aria-busy={loading} style={{ ...buttonGold, opacity: loading ? 0.75 : 1, marginTop: 2 }}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link className="auth-link" style={{ ...linkButton, color: '#C98A0E' }} href="/reset-password">
              ¿Olvidaste tu contraseña?
            </Link>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: C.textWarm, lineHeight: 1.45 }}>
              Pide a tu representante un código de recuperación. Caduca en 10 minutos.
            </p>
          </div>
        </form>
    </AuthCard>
  );
}



