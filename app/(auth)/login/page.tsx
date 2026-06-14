'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    console.log('data:', data);
    console.log('error:', signInError);

    if (signInError) {
      setError('Correo o contraseña incorrectos');
      setLoading(false);
      return;
    }

    const rol = (data?.user as any)?.role;
    console.log('rol:', rol); // También agregué este log para ver el rol

    // Redirección según el rol
    if (rol === 'admin') {
      router.push('/admin');
    } else if (rol === 'representante') {
      router.push('/representante');
    } else if (rol === 'operador_pozo' || rol === 'cuadrilla_cortes') {
      router.push('/trabajador');
    } else {
      // Para residentes (rol 'residente' o cualquier otro)
      // La página /residente se encargará de redirigir a /registro si el perfil está incompleto
      router.push('/residente');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <span className="text-2xl">💧</span>
          </div>
          <CardTitle>Sistema de Agua</CardTitle>
          <CardDescription>Fraccionamiento — Inicia sesión</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
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
            <div className="space-y-1">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button
            variant="link"
            onClick={() => router.push('/registro')}
            className="text-sm text-muted-foreground"
          >
            ¿No tienes cuenta? Regístrate
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}