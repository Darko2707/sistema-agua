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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LetraDepto = 'a' | 'b' | 'c';

type PerfilForm = {
  telefono: string;
  sexo: 'masculino' | 'femenino' | 'otro';
  tenencia: 'propietario' | 'inquilino';
  circuitoId: string;
  edificio: string;
  deptoNumero: string;
  deptoLetra: LetraDepto;
  nombrePropietario: string;
  telefonoPropietario: string;
};

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

export default function RegistroPage() {
  const router = useRouter();

  const [paso, setPaso]       = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [cuenta, setCuenta] = useState({ nombre: '', email: '', password: '' });

  const [perfil, setPerfil] = useState<PerfilForm>({
    telefono:            '',
    sexo:                'masculino',
    tenencia:            'propietario',
    circuitoId:          '',
    edificio:            '',
    deptoNumero:         '',
    deptoLetra:          'a',
    nombrePropietario:   '',
    telefonoPropietario: '',
  });

  const circuitosQuery = trpcReact.usuarios.listarCircuitos.useQuery();
  const circuitos      = circuitosQuery.data ?? [];

  const esInquilino = perfil.tenencia === 'inquilino';

  function set<K extends keyof PerfilForm>(key: K, value: PerfilForm[K]) {
    setPerfil(p => ({ ...p, [key]: value }));
  }

  // ── Paso 1: validar datos de cuenta ───────────────────────────────────────
  async function handleCrearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (cuenta.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setPaso(2);
  }

  // ── Paso 2: validar perfil, crear cuenta y guardar ────────────────────────
  async function handleCompletarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validaciones de cliente
    if (!perfil.deptoNumero.trim() || isNaN(Number(perfil.deptoNumero))) {
      setError('El número de departamento debe ser un número válido');
      return;
    }
    if (esInquilino && !perfil.nombrePropietario.trim()) {
      setError('Ingresa el nombre del propietario');
      return;
    }
    if (esInquilino && perfil.telefonoPropietario.trim().length < 10) {
      setError('Ingresa el teléfono del propietario (mínimo 10 dígitos)');
      return;
    }

    setLoading(true);
    try {
      // 1. Crear cuenta
      const { error: signUpError } = await authClient.signUp.email({
        email:    cuenta.email,
        password: cuenta.password,
        name:     cuenta.nombre,
      });
      if (signUpError) {
        setPaso(1);
        throw new Error(signUpError.message ?? 'No se pudo crear la cuenta. El correo podría estar registrado.');
      }

      // 2. Iniciar sesión
      const { error: signInError } = await authClient.signIn.email({
        email:    cuenta.email,
        password: cuenta.password,
      });
      if (signInError) throw new Error('Cuenta creada, pero no se pudo iniciar sesión automáticamente.');

      // 3. Guardar perfil
      await trpc.usuarios.crearPerfil.mutate({
        telefono:            perfil.telefono,
        sexo:                perfil.sexo,
        tenencia:            perfil.tenencia,
        circuitoId:          perfil.circuitoId,
        edificio:            perfil.edificio,
        departamento:        `${perfil.deptoNumero.trim()}${perfil.deptoLetra}`,
        ...(esInquilino && {
          nombrePropietario:   perfil.nombrePropietario.trim(),
          telefonoPropietario: perfil.telefonoPropietario.trim(),
        }),
      });

      router.push('/residente');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
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
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 w-1/2 rounded-full bg-primary" />
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleCrearCuenta} className="space-y-5">
              <div className="space-y-2">
                <Label>Nombre completo</Label>
                <Input
                  placeholder="Juan Pérez"
                  value={cuenta.nombre}
                  onChange={e => setCuenta(p => ({ ...p, nombre: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={cuenta.email}
                  onChange={e => setCuenta(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  value={cuenta.password}
                  onChange={e => setCuenta(p => ({ ...p, password: e.target.value }))}
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Cargando...' : 'Continuar'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <button type="button" className="font-semibold text-primary" onClick={() => router.push('/login')}>
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
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 w-full rounded-full bg-primary" />
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleCompletarPerfil} className="space-y-5">

            {/* Teléfono + Sexo */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  type="tel"
                  placeholder="2281234567"
                  value={perfil.telefono}
                  onChange={e => set('telefono', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Sexo</Label>
                <select className={SELECT_CLASS} value={perfil.sexo} onChange={e => set('sexo', e.target.value as PerfilForm['sexo'])}>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            {/* Tenencia + Circuito */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tenencia</Label>
                <select className={SELECT_CLASS} value={perfil.tenencia} onChange={e => set('tenencia', e.target.value as PerfilForm['tenencia'])}>
                  <option value="propietario">Propietario</option>
                  <option value="inquilino">Inquilino</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Circuito</Label>
                <select className={SELECT_CLASS} value={perfil.circuitoId} onChange={e => set('circuitoId', e.target.value)} required>
                  <option value="">Selecciona tu circuito</option>
                  {circuitos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            {/* Datos del propietario (solo inquilino) */}
            {esInquilino && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
                <p className="text-sm font-medium text-amber-800">
                  Como inquilino, necesitamos los datos del propietario del departamento.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre del propietario</Label>
                    <Input
                      placeholder="Nombre completo del dueño"
                      value={perfil.nombrePropietario}
                      onChange={e => set('nombrePropietario', e.target.value)}
                      required={esInquilino}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono del propietario</Label>
                    <Input
                      type="tel"
                      placeholder="2281234567"
                      value={perfil.telefonoPropietario}
                      onChange={e => set('telefonoPropietario', e.target.value)}
                      required={esInquilino}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Edificio + Departamento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Edificio</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="8"
                  value={perfil.edificio}
                  onChange={e => set('edificio', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Departamento</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="314"
                    className="flex-1"
                    value={perfil.deptoNumero}
                    onChange={e => set('deptoNumero', e.target.value)}
                    required
                  />
                  <select
                    className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                    value={perfil.deptoLetra}
                    onChange={e => set('deptoLetra', e.target.value as LetraDepto)}
                  >
                    <option value="a">A — P1</option>
                    <option value="b">B — P2</option>
                    <option value="c">C — P3</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Número + piso: <strong>{perfil.deptoNumero || '___'}{perfil.deptoLetra}</strong>
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Guardando...' : 'Finalizar registro'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
