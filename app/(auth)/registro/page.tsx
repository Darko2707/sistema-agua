'use client';

import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type Circuito = { id: string; nombre: string };

export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [circuitos, setCircuitos] = useState<Circuito[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [cuenta, setCuenta] = useState({ nombre: '', email: '', password: '' });
  const [perfil, setPerfil] = useState({
    telefono: '',
    sexo: 'masculino',
    tenencia: 'propietario',
    circuitoId: '',
    edificio: '',
    departamento: '',
  });

  useEffect(() => {
    fetch('/api/circuitos')
      .then((r) => r.json())
      .then(setCircuitos)
      .catch(() => setCircuitos([]));
  }, []);

  // Paso 1: Crear cuenta e iniciar sesión automáticamente
  async function handleCrearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 1. Registrar usuario
    const { error: signUpError } = await authClient.signUp.email({
      email: cuenta.email,
      password: cuenta.password,
      name: cuenta.nombre,
    });

    if (signUpError) {
      setError(signUpError.message ?? 'No se pudo crear la cuenta');
      setLoading(false);
      return;
    }

    // 2. Iniciar sesión automáticamente (para que el usuario tenga sesión activa)
    const { error: signInError } = await authClient.signIn.email({
      email: cuenta.email,
      password: cuenta.password,
    });

    if (signInError) {
      setError('Cuenta creada, pero no se pudo iniciar sesión automáticamente. Por favor inicia sesión manualmente.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setPaso(2);
  }

  // Paso 2: Completar perfil (usando tRPC directo sin batch)
  async function handleCompletarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/trpc/usuarios.crearPerfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perfil),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message ?? 'Error al guardar tu información');
      }

      router.push('/residente');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // --- Paso 1: formulario de cuenta ---
  if (paso === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <span className="text-2xl">💧</span>
            </div>
            <CardTitle>Crear cuenta</CardTitle>
            <CardDescription>Paso 1 de 2 — Datos de acceso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCrearCuenta} className="space-y-4">
              <div className="space-y-1">
                <Label>Nombre completo</Label>
                <Input
                  placeholder="Juan Pérez"
                  value={cuenta.nombre}
                  onChange={(e) => setCuenta((p) => ({ ...p, nombre: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={cuenta.email}
                  onChange={(e) => setCuenta((p) => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  value={cuenta.password}
                  onChange={(e) => setCuenta((p) => ({ ...p, password: e.target.value }))}
                  minLength={8}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creando...' : 'Continuar'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <a href="/login" className="text-primary font-medium">
                  Inicia sesión
                </a>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Paso 2: formulario de perfil ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Completa tu perfil</CardTitle>
          <CardDescription>Paso 2 de 2 — Datos de tu vivienda</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCompletarPerfil} className="space-y-4">
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input
                type="tel"
                placeholder="2281234567"
                value={perfil.telefono}
                onChange={(e) => setPerfil((p) => ({ ...p, telefono: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>Sexo</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={perfil.sexo}
                onChange={(e) => setPerfil((p) => ({ ...p, sexo: e.target.value }))}
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>¿Rentas o eres propietario?</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={perfil.tenencia}
                onChange={(e) => setPerfil((p) => ({ ...p, tenencia: e.target.value }))}
              >
                <option value="propietario">Propietario</option>
                <option value="inquilino">Inquilino (renta)</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>Circuito</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={perfil.circuitoId}
                onChange={(e) => setPerfil((p) => ({ ...p, circuitoId: e.target.value }))}
                required
              >
                <option value="">Selecciona tu circuito</option>
                {circuitos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Edificio</Label>
                <Input
                  placeholder="Edif. 12"
                  value={perfil.edificio}
                  onChange={(e) => setPerfil((p) => ({ ...p, edificio: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Depto.</Label>
                <Input
                  placeholder="Depto 3"
                  value={perfil.departamento}
                  onChange={(e) => setPerfil((p) => ({ ...p, departamento: e.target.value }))}
                  required
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : 'Finalizar registro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}