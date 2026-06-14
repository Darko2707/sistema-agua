'use client';

import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc-client';
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

export default function RegistroPage() {
  const router = useRouter();
  
  // Paso 1: Registro de usuario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1); // 1: registro, 2: completar perfil
  const [userId, setUserId] = useState('');
  
  // Estado general
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Perfil adicional
  const [perfil, setPerfil] = useState<{
    nombre_completo: string;
    telefono: string;
    direccion: string;
    numero_casa: string;
    sexo: 'masculino' | 'femenino' | 'otro';
    tenencia: 'propietario' | 'inquilino';
    circuitoId: string;
    edificio: string;
    departamento: string;
  }>({
    nombre_completo: '',
    telefono: '',
    direccion: '',
    numero_casa: '',
    sexo: 'masculino',
    tenencia: 'propietario',
    circuitoId: '',
    edificio: '',
    departamento: '',
  });

  // Paso 1: Registrar usuario
  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: nombre,
      });

      if (signUpError) {
        setError(signUpError.message || 'Error al crear la cuenta');
        setLoading(false);
        return;
      }

      // Guardar el ID del usuario para el paso 2
      if (data?.user?.id) {
        setUserId(data.user.id);
        setStep(2); // Avanzar al paso de completar perfil
      } else {
        setError('Error al obtener los datos del usuario');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  // Paso 2: Completar perfil usando tRPC
  async function handleCompletarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await trpc.usuarios.crearPerfil.mutate(perfil);
      router.push('/residente');
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar la información');
    } finally {
      setLoading(false);
    }
  }

  // Paso 3: Formulario de completar perfil
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardHeader className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <Droplets className="h-8 w-8" />
            </div>
            
            <div>
              <CardTitle className="text-3xl">
                Completa tu perfil
              </CardTitle>
              <CardDescription className="mt-2">
                Cuéntanos más sobre ti para continuar
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleCompletarPerfil} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="nombre_completo">
                  Nombre completo
                </Label>
                <Input
                  id="nombre_completo"
                  type="text"
                  placeholder="Juan Pérez González"
                  value={perfil.nombre_completo}
                  onChange={(e) =>
                    setPerfil({ ...perfil, nombre_completo: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  type="tel"
                  placeholder="5512345678"
                  value={perfil.telefono}
                  onChange={(e) =>
                    setPerfil({ ...perfil, telefono: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  type="text"
                  placeholder="Calle Principal #123"
                  value={perfil.direccion}
                  onChange={(e) =>
                    setPerfil({ ...perfil, direccion: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="numero_casa">Número de casa</Label>
                <Input
                  id="numero_casa"
                  type="text"
                  placeholder="12"
                  value={perfil.numero_casa}
                  onChange={(e) =>
                    setPerfil({ ...perfil, numero_casa: e.target.value })
                  }
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Guardando...' : 'Completar registro'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Paso 1: Formulario de registro inicial
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Droplets className="h-8 w-8" />
          </div>

          <div>
            <CardTitle className="text-3xl">
              Crear cuenta
            </CardTitle>

            <CardDescription className="mt-2">
              Regístrate para acceder al sistema de agua
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleRegistro} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                type="text"
                placeholder="Juan Pérez"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Correo electrónico
              </Label>
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
              <Label htmlFor="password">
                Contraseña
              </Label>

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
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
            >
              {loading ? 'Creando cuenta...' : 'Registrarse'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <Button
            variant="link"
            onClick={() => router.push('/login')}
          >
            ¿Ya tienes cuenta? Inicia sesión
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}