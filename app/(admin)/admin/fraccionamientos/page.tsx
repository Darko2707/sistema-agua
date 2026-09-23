'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CheckCircle2, Loader2, Plus, TriangleAlert } from 'lucide-react';

import { trpcReact } from '@/lib/trpc-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FraccionamientosAdminPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const fraccionamientosQuery = trpcReact.fraccionamientos.listar.useQuery();
  const crearMutation = trpcReact.fraccionamientos.crear.useMutation();

  async function crearFraccionamiento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMensaje(null);

    const nombreNormalizado = nombre.trim();
    if (nombreNormalizado.length < 2) {
      setError('Escribe un nombre de al menos 2 caracteres');
      return;
    }

    try {
      const creado = await crearMutation.mutateAsync({ nombre: nombreNormalizado });
      setNombre('');
      setMensaje(`Fraccionamiento “${creado.nombre}” creado correctamente`);
      await fraccionamientosQuery.refetch();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el fraccionamiento');
    }
  }

  const fraccionamientos = fraccionamientosQuery.data ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-600 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8" />
              <div>
                <h1 className="text-3xl font-bold">Fraccionamientos</h1>
                <p className="mt-1 text-sky-100">Alta de nuevos tenants y consulta del catálogo activo</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/admin')}
              className="border-none bg-white/10 text-white hover:bg-white/20"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>

        {(error || mensaje) && (
          <div
            role="alert"
            className={`flex items-center gap-2 rounded-2xl border p-4 ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            {error ? <TriangleAlert className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <span>{error ?? mensaje}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Crear nuevo fraccionamiento</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={crearFraccionamiento}>
              <div className="flex-1 space-y-2">
                <Label htmlFor="nombre-fraccionamiento">Nombre</Label>
                <Input
                  id="nombre-fraccionamiento"
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  placeholder="Fraccionamiento Las Palmas"
                  maxLength={160}
                  autoComplete="organization"
                  required
                />
              </div>
              <Button type="submit" disabled={crearMutation.isPending}>
                {crearMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Crear fraccionamiento
              </Button>
            </form>
            <p className="mt-3 text-sm text-muted-foreground">
              Después de crearlo deberás configurar su suscripción anual, servicios y circuitos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fraccionamientos activos</CardTitle>
          </CardHeader>
          <CardContent>
            {fraccionamientosQuery.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : fraccionamientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay fraccionamientos activos.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {fraccionamientos.map((fraccionamiento) => (
                  <div key={fraccionamiento.id} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{fraccionamiento.nombre}</p>
                      <p className="text-sm text-muted-foreground">/{fraccionamiento.slug}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Activo
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
