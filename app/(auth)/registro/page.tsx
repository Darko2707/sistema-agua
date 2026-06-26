'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { trpc } from '@/lib/trpc-client';
import { useCircuitos } from '@/hooks/useCircuito';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const cuentaSchema = z.object({
  nombre:   z.string().min(2, 'Ingresa tu nombre completo'),
  email:    z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});
type CuentaForm = z.infer<typeof cuentaSchema>;

// U7: departamento = número + letra opcional (cualquier letra)
const perfilSchema = z.object({
  telefono:            z.string().min(10, 'Mínimo 10 dígitos').regex(/^\d+$/, 'Solo números'),
  sexo:                z.enum(['masculino', 'femenino', 'otro']),
  tenencia:            z.enum(['propietario', 'inquilino']),
  circuitoId:          z.string().min(1, 'Selecciona tu circuito'),
  edificio:            z.string().min(1, 'Ingresa el número de edificio'),
  deptoNumero:         z.string().min(1, 'Ingresa el número de departamento').regex(/^\d+$/, 'Solo dígitos'),
  deptoLetra:          z.string().regex(/^[a-zA-Z]?$/, 'Solo una letra (opcional)').optional(),
  nombrePropietario:   z.string().optional(),
  telefonoPropietario: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tenencia === 'inquilino') {
    if (!data.nombrePropietario || data.nombrePropietario.trim().length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Ingresa el nombre del propietario', path: ['nombrePropietario'] });
    }
    if (!data.telefonoPropietario || data.telefonoPropietario.trim().length < 10) {
      ctx.addIssue({ code: 'custom', message: 'Teléfono del propietario (mínimo 10 dígitos)', path: ['telefonoPropietario'] });
    }
  }
});
type PerfilForm = z.infer<typeof perfilSchema>;

// ── Shared select class ───────────────────────────────────────────────────────
const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

// ── Error message component ───────────────────────────────────────────────────
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-700" aria-live="polite">
      {message}
    </p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RegistroPage() {
  const router = useRouter();
  const [paso, setPaso]           = useState<1 | 2>(1);
  const [serverError, setError]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  const circuitosQuery = useCircuitos();
  const circuitos      = circuitosQuery.data ?? [];

  // ── Paso 1 form ────────────────────────────────────────────────────────────
  const cuenta = useForm<CuentaForm>({
    resolver: zodResolver(cuentaSchema),
    mode: 'onTouched',
  });

  // ── Paso 2 form ────────────────────────────────────────────────────────────
  const perfil = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    mode: 'onTouched',
    defaultValues: {
      sexo:     'masculino',
      tenencia: 'propietario',
      deptoLetra: '',
    },
  });
  const tenencia     = perfil.watch('tenencia');
  const esInquilino  = tenencia === 'inquilino';
  const deptoNumero  = perfil.watch('deptoNumero') ?? '';
  const deptoLetra   = perfil.watch('deptoLetra') ?? '';

  // ── Paso 1 submit ──────────────────────────────────────────────────────────
  async function handleCrearCuenta(data: CuentaForm) {
    setError('');
    void data; // validation passed — move to step 2 storing values via RHF
    setPaso(2);
  }

  // ── Paso 2 submit ──────────────────────────────────────────────────────────
  async function handleCompletarPerfil(data: PerfilForm) {
    setError('');
    setSubmitting(true);

    const cuentaData = cuenta.getValues();
    const departamento = `${data.deptoNumero.trim()}${(data.deptoLetra ?? '').trim()}`;

    try {
      const { error: signUpError } = await authClient.signUp.email({
        email:    cuentaData.email,
        password: cuentaData.password,
        name:     cuentaData.nombre,
      });
      if (signUpError) {
        setPaso(1);
        throw new Error(signUpError.message ?? 'No se pudo crear la cuenta. El correo podría estar registrado.');
      }

      const { error: signInError } = await authClient.signIn.email({
        email:    cuentaData.email,
        password: cuentaData.password,
      });
      if (signInError) throw new Error('Cuenta creada, pero no se pudo iniciar sesión automáticamente.');

      await trpc.usuarios.crearPerfil.mutate({
        telefono:    data.telefono,
        sexo:        data.sexo,
        tenencia:    data.tenencia,
        circuitoId:  data.circuitoId,
        edificio:    data.edificio,
        departamento,
        ...(esInquilino && {
          nombrePropietario:   data.nombrePropietario?.trim(),
          telefonoPropietario: data.telefonoPropietario?.trim(),
        }),
      });

      router.push('/verificar-email');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  if (paso === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden">
              <Image src="/logo1SIS4S.png" alt="SIS4S Logo" width={80} height={80} className="object-contain" priority />
            </div>
            <div>
              <CardTitle className="text-3xl">Crear cuenta</CardTitle>
              <CardDescription>Paso 1 de 2</CardDescription>
            </div>
            <div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={50} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de registro: paso 1 de 2">
              <div className="h-2 w-1/2 rounded-full bg-primary" />
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={cuenta.handleSubmit(handleCrearCuenta)} className="space-y-5" noValidate aria-label="Formulario de creación de cuenta">
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre completo</Label>
                <Input
                  id="nombre"
                  placeholder="Juan Pérez"
                  autoComplete="name"
                  aria-required="true"
                  aria-describedby={cuenta.formState.errors.nombre ? 'nombre-error' : undefined}
                  aria-invalid={!!cuenta.formState.errors.nombre}
                  {...cuenta.register('nombre')}
                />
                <FieldError id="nombre-error" message={cuenta.formState.errors.nombre?.message} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  aria-required="true"
                  aria-describedby={cuenta.formState.errors.email ? 'email-error' : undefined}
                  aria-invalid={!!cuenta.formState.errors.email}
                  {...cuenta.register('email')}
                />
                <FieldError id="email-error" message={cuenta.formState.errors.email?.message} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  autoComplete="new-password"
                  aria-required="true"
                  aria-describedby={cuenta.formState.errors.password ? 'password-error' : 'password-hint'}
                  aria-invalid={!!cuenta.formState.errors.password}
                  {...cuenta.register('password')}
                />
                <p id="password-hint" className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
                <FieldError id="password-error" message={cuenta.formState.errors.password?.message} />
              </div>

              {serverError && (
                <div role="alert" aria-live="assertive" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {serverError}
                </div>
              )}

              <Button type="submit" className="w-full h-11">
                Continuar
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => router.push('/login')}>
                  Inicia sesión
                </button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Paso 2 ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden">
            <Image src="/logo1SIS4S.png" alt="SIS4S Logo" width={80} height={80} className="object-contain" priority />
          </div>
          <CardTitle className="text-3xl text-center">Completa tu perfil</CardTitle>
          <CardDescription className="text-center">Paso 2 de 2</CardDescription>
          <div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de registro: paso 2 de 2">
            <div className="h-2 w-full rounded-full bg-primary" />
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={perfil.handleSubmit(handleCompletarPerfil)}
            className="space-y-5"
            noValidate
            aria-label="Formulario de perfil de residente"
          >
            {/* Teléfono + Sexo */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  type="tel"
                  placeholder="2281234567"
                  autoComplete="tel"
                  aria-required="true"
                  aria-describedby={perfil.formState.errors.telefono ? 'telefono-error' : undefined}
                  aria-invalid={!!perfil.formState.errors.telefono}
                  {...perfil.register('telefono')}
                />
                <FieldError id="telefono-error" message={perfil.formState.errors.telefono?.message} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="sexo">Sexo</Label>
                <select
                  id="sexo"
                  className={SELECT_CLASS}
                  aria-required="true"
                  {...perfil.register('sexo')}
                >
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            {/* Tenencia + Circuito */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="tenencia">Tenencia</Label>
                <select
                  id="tenencia"
                  className={SELECT_CLASS}
                  aria-required="true"
                  {...perfil.register('tenencia')}
                >
                  <option value="propietario">Propietario</option>
                  <option value="inquilino">Inquilino</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="circuitoId">Circuito</Label>
                <select
                  id="circuitoId"
                  className={SELECT_CLASS}
                  aria-required="true"
                  aria-describedby={perfil.formState.errors.circuitoId ? 'circuito-error' : undefined}
                  aria-invalid={!!perfil.formState.errors.circuitoId}
                  {...perfil.register('circuitoId')}
                >
                  <option value="">Selecciona tu circuito</option>
                  {circuitos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <FieldError id="circuito-error" message={perfil.formState.errors.circuitoId?.message} />
              </div>
            </div>

            {/* Datos del propietario (solo inquilino) */}
            {esInquilino && (
              <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
                <legend className="text-sm font-medium text-amber-800 px-1">
                  Como inquilino, necesitamos los datos del propietario del departamento.
                </legend>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="nombrePropietario">Nombre del propietario</Label>
                    <Input
                      id="nombrePropietario"
                      placeholder="Nombre completo del dueño"
                      aria-required="true"
                      aria-describedby={perfil.formState.errors.nombrePropietario ? 'nombre-prop-error' : undefined}
                      aria-invalid={!!perfil.formState.errors.nombrePropietario}
                      {...perfil.register('nombrePropietario')}
                    />
                    <FieldError id="nombre-prop-error" message={perfil.formState.errors.nombrePropietario?.message} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="telefonoPropietario">Teléfono del propietario</Label>
                    <Input
                      id="telefonoPropietario"
                      type="tel"
                      placeholder="2281234567"
                      aria-required="true"
                      aria-describedby={perfil.formState.errors.telefonoPropietario ? 'tel-prop-error' : undefined}
                      aria-invalid={!!perfil.formState.errors.telefonoPropietario}
                      {...perfil.register('telefonoPropietario')}
                    />
                    <FieldError id="tel-prop-error" message={perfil.formState.errors.telefonoPropietario?.message} />
                  </div>
                </div>
              </fieldset>
            )}

            {/* Edificio + Departamento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edificio">Edificio</Label>
                <Input
                  id="edificio"
                  type="number"
                  min="1"
                  placeholder="8"
                  aria-required="true"
                  aria-describedby={perfil.formState.errors.edificio ? 'edificio-error' : undefined}
                  aria-invalid={!!perfil.formState.errors.edificio}
                  {...perfil.register('edificio')}
                />
                <FieldError id="edificio-error" message={perfil.formState.errors.edificio?.message} />
              </div>

              {/* U7: letra ahora es texto libre opcional (cualquier letra) */}
              <div className="space-y-1">
                <Label htmlFor="deptoNumero">Departamento</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="deptoNumero"
                      type="text"
                      inputMode="numeric"
                      placeholder="314"
                      aria-required="true"
                      aria-describedby="depto-preview depto-num-error"
                      aria-invalid={!!perfil.formState.errors.deptoNumero}
                      {...perfil.register('deptoNumero')}
                    />
                    <FieldError id="depto-num-error" message={perfil.formState.errors.deptoNumero?.message} />
                  </div>
                  <div>
                    <Input
                      id="deptoLetra"
                      type="text"
                      maxLength={1}
                      placeholder="a"
                      className="w-16 uppercase"
                      aria-label="Letra del departamento (opcional)"
                      aria-describedby="depto-preview depto-letra-error"
                      aria-invalid={!!perfil.formState.errors.deptoLetra}
                      {...perfil.register('deptoLetra', {
                        onChange: (e) => {
                          // Force uppercase display
                          e.target.value = e.target.value.toUpperCase();
                        },
                      })}
                    />
                    <FieldError id="depto-letra-error" message={perfil.formState.errors.deptoLetra?.message} />
                  </div>
                </div>
                <p id="depto-preview" className="text-xs text-muted-foreground">
                  Número + letra:{' '}
                  <strong aria-live="polite">
                    {deptoNumero || '___'}{deptoLetra}
                  </strong>
                </p>
              </div>
            </div>

            {serverError && (
              <div role="alert" aria-live="assertive" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Guardando...' : 'Finalizar registro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
