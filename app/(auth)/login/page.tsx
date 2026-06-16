'use client';

import { authClient, signIn } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        setError(signInError.message || 'Correo o contraseña incorrectos');
        setLoading(false);
        return;
      }

      const meRes = await fetch('/api/me');
      const { role: rol } = await meRes.json();

      localStorage.setItem('userRole', rol);

      if (rol === 'admin') {
        router.push('/admin');
      } else if (rol === 'representante') {
        router.push('/representante');
      } else if (rol === 'operador_pozo' || rol === 'cuadrilla_cortes') {
        router.push('/trabajador');
      } else {
        router.push('/residente');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
  e.preventDefault();
  setResetLoading(true);
  setResetError('');
  setResetSent(false);

  try {
    const res = await fetch('/api/forgot-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: resetEmail,
  }),
});

    if (res.ok) {
      setResetSent(true);
      setResetEmail('');
      setTimeout(() => {
        setShowReset(false);
        setResetSent(false);
      }, 5000);
    } else {
      const data = await res.json();
      setResetError(data.error || 'Error al enviar el correo de recuperación');
    }
  } catch (err: any) {
    setResetError(err.message || 'Error al enviar el correo');
  }
  setResetLoading(false);
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Droplets className="h-8 w-8" />
          </div>
          <div>
            <CardTitle className="text-3xl">Iniciar sesión</CardTitle>
            <CardDescription className="mt-2">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {!showReset ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
              </Button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="text-sm text-primary hover:underline focus:outline-none"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Correo electrónico</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Te enviaremos un enlace para restablecer tu contraseña.
                </p>
              </div>

              {resetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {resetError}
                </div>
              )}

              {resetSent && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
                  ✅ Correo de recuperación enviado. Revisa tu bandeja de entrada.
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={resetLoading}>
                {resetLoading ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </Button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReset(false);
                    setResetError('');
                    setResetSent(false);
                  }}
                  className="text-sm text-muted-foreground hover:underline focus:outline-none"
                >
                  ← Volver al inicio de sesión
                </button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="link" onClick={() => router.push('/registro')}>
            ¿No tienes cuenta? Regístrate
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}