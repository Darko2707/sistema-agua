'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { trpc } from '@/lib/trpc-client';
import { trpcReact } from '@/lib/trpc-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type PerfilForm = {
  telefono: string;
  sexo: 'masculino' | 'femenino' | 'otro';
  tenencia: 'propietario' | 'inquilino';
  circuitoId: string;
  edificio: string;
  departamento: string;
};

export default function RegistroPage() {
  const router = useRouter();

  const [paso, setPaso] =
    useState<1 | 2>(1);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [cuenta, setCuenta] =
    useState({
      nombre: '',
      email: '',
      password: '',
    });

  const [perfil, setPerfil] =
    useState<PerfilForm>({
      telefono: '',
      sexo: 'masculino',
      tenencia: 'propietario',
      circuitoId: '',
      edificio: '',
      departamento: '',
    });

  const circuitosQuery = trpcReact.usuarios.listarCircuitos.useQuery();
  const circuitos = circuitosQuery.data ?? [];

  // ✅ Paso 1: Solo guarda los datos en estado local, no crea nada
  async function handleCrearCuenta(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setError('');
    
    // Validación básica
    if (cuenta.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    // Solo avanza al paso 2, no crea la cuenta todavía
    setPaso(2);
  }

  // ✅ Paso 2: Crea la cuenta, inicia sesión y guarda el perfil
  async function handleCompletarPerfil(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      // 1. Crear cuenta
      const { error: signUpError } =
        await authClient.signUp.email({
          email: cuenta.email,
          password: cuenta.password,
          name: cuenta.nombre,
        });

      if (signUpError) {
        // Regresa al paso 1 si el correo ya existe
        setPaso(1);
        throw new Error(
          signUpError.message ??
            'No se pudo crear la cuenta. El correo podría estar registrado.'
        );
      }

      // 2. Iniciar sesión automáticamente
      const { error: signInError } =
        await authClient.signIn.email({
          email: cuenta.email,
          password: cuenta.password,
        });

      if (signInError) {
        throw new Error(
          'Cuenta creada, pero no se pudo iniciar sesión automáticamente.'
        );
      }

      // 3. Guardar perfil
      await trpc.usuarios.crearPerfil.mutate(perfil);

      router.push('/residente');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (paso === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden">
              <Image
                src="/logo1SIS4S.png"
                alt="SIS4S Logo"
                width={80}
                height={80}
                className="object-contain"
                priority
              />
            </div>

            <div>
              <CardTitle className="text-3xl">
                Crear cuenta
              </CardTitle>

              <CardDescription>
                Paso 1 de 2
              </CardDescription>
            </div>

            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 w-1/2 rounded-full bg-primary" />
            </div>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={
                handleCrearCuenta
              }
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label>
                  Nombre completo
                </Label>

                <Input
                  placeholder="Juan Pérez"
                  value={
                    cuenta.nombre
                  }
                  onChange={(e) =>
                    setCuenta(
                      (p) => ({
                        ...p,
                        nombre:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Correo electrónico
                </Label>

                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={
                    cuenta.email
                  }
                  onChange={(e) =>
                    setCuenta(
                      (p) => ({
                        ...p,
                        email:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Contraseña
                </Label>

                <Input
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  value={
                    cuenta.password
                  }
                  onChange={(e) =>
                    setCuenta(
                      (p) => ({
                        ...p,
                        password:
                          e.target
                            .value,
                      }),
                    )
                  }
                  minLength={8}
                  required
                />
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
                {loading
                  ? 'Cargando...'
                  : 'Continuar'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <button
                  type="button"
                  className="font-semibold text-primary"
                  onClick={() =>
                    router.push(
                      '/login',
                    )
                  }
                >
                  Inicia sesión
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden">
            <Image
              src="/logo1SIS4S.png"
              alt="SIS4S Logo"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <CardTitle className="text-3xl text-center">
            Completa tu perfil
          </CardTitle>

          <CardDescription className="text-center">
            Paso 2 de 2
          </CardDescription>

          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 w-full rounded-full bg-primary" />
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={
              handleCompletarPerfil
            }
            className="space-y-5"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Teléfono
                </Label>

                <Input
                  type="tel"
                  placeholder="2281234567"
                  value={
                    perfil.telefono
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        telefono:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Sexo
                </Label>

                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={
                    perfil.sexo
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        sexo: e.target.value as 'masculino' | 'femenino' | 'otro',
                      }),
                    )
                  }
                >
                  <option value="masculino">
                    Masculino
                  </option>
                  <option value="femenino">
                    Femenino
                  </option>
                  <option value="otro">
                    Otro
                  </option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Tenencia
                </Label>

                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={
                    perfil.tenencia
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        tenencia: e.target.value as 'propietario' | 'inquilino',
                      }),
                    )
                  }
                >
                  <option value="propietario">
                    Propietario
                  </option>
                  <option value="inquilino">
                    Inquilino
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>
                  Circuito
                </Label>

                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={
                    perfil.circuitoId
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        circuitoId:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                >
                  <option value="">
                    Selecciona tu
                    circuito
                  </option>

                  {circuitos.map(
                    (c) => (
                      <option
                        key={c.id}
                        value={c.id}
                      >
                        {c.nombre}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Edificio
                </Label>

                <Input
                  placeholder="12"
                  value={
                    perfil.edificio
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        edificio:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Departamento
                </Label>

                <Input
                  placeholder="3"
                  value={
                    perfil.departamento
                  }
                  onChange={(e) =>
                    setPerfil(
                      (p) => ({
                        ...p,
                        departamento:
                          e.target
                            .value,
                      }),
                    )
                  }
                  required
                />
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
              {loading
                ? 'Guardando...'
                : 'Finalizar registro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}