'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Info, CheckCircle, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trpcReact } from '@/lib/trpc-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Tesorera = {
  id: string;
  name: string;
  email: string;
  fraccionamiento: {
    id: string;
    nombre: string | null;
  } | null;
};

type FormState = {
  fraccionamientoId: string;
  mercadoPagoAccessToken: string;
  mercadoPagoCollectorId: string;
};

const emptyForm: FormState = {
  fraccionamientoId: '',
  mercadoPagoAccessToken: '',
  mercadoPagoCollectorId: '',
};

export default function AdminTesorerasPage() {
  const router = useRouter();
  const utils  = trpcReact.useUtils();

  const [editando, setEditando] = useState<Tesorera | null>(null);
  const [form,     setForm]     = useState<FormState>(emptyForm);
  const [error,    setError]    = useState<string | null>(null);
  const [mensaje,  setMensaje]  = useState<string | null>(null);

  const tesorerasQuery = trpcReact.usuarios.listarTesoreras.useQuery();
  const fraccionamientosQuery = trpcReact.fraccionamientos.listar.useQuery();

  const tesoreras = tesorerasQuery.data ?? [];
  const cargando  = tesorerasQuery.isLoading;

  // Circuitos disponibles: sin tesorera o el circuito actual de la que se edita
  const fraccionamientosDisponibles = useMemo(() => fraccionamientosQuery.data ?? [], [fraccionamientosQuery.data]);

  const asignarMut = trpcReact.usuarios.asignarTesorera.useMutation();

  function abrirEditar(tes: Tesorera) {
    setEditando(tes);
    setForm({
      fraccionamientoId: tes.fraccionamiento?.id ?? '',
      mercadoPagoAccessToken: '',
      mercadoPagoCollectorId: '',
    });
    setError(null);
    setMensaje(null);
  }

  function cerrarModal() {
    setEditando(null);
    setError(null);
  }

  async function guardar() {
    if (!editando) return;
    setError(null);
    if (form.mercadoPagoAccessToken.trim() || form.mercadoPagoCollectorId.trim()) {
      setError('Configura Mercado Pago desde Fraccionamientos; las tesoreras no pueden modificar credenciales.');
      return;
    }
    try {
      if (!form.fraccionamientoId) throw new Error('Selecciona un fraccionamiento');
      await asignarMut.mutateAsync({
        userId: editando.id,
        fraccionamientoId: form.fraccionamientoId,
      });
      setMensaje('Configuración guardada correctamente');
      setEditando(null);
      void utils.usuarios.listarTesoreras.invalidate();
      void utils.fraccionamientos.listar.invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tesorera/o</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Asigna fraccionamientos para cada tesorero/a.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/admin')}>
            <ArrowLeft className="mr-2 h-4 w-4" />Volver
          </Button>
        </div>

        {/* Aviso informativo */}
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p>
            Para añadir un tesorero/a, cambia el rol de un residente a{' '}
            <strong>Tesorera/o</strong> desde la pestaña{' '}
            <strong>Personal</strong> en el panel de administrador.
            Después aparecerá aquí para asignarle un fraccionamiento y sus credenciales de Mercado Pago.
          </p>
        </div>

        {error   && <div className="rounded-lg border border-red-200   bg-red-50   p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Tesorera/o registrados</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <p className="py-10 text-center text-muted-foreground">Cargando...</p>
            ) : tesoreras.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                No hay usuarios con rol de tesorero/a. Asigna el rol desde la pestaña Personal.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Fraccionamiento</TableHead>
                    <TableHead className="w-28 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tesoreras.map((tes) => {
                    const tieneMp = !!tes.fraccionamiento?.mercadoPagoCollectorId;
                    return (
                      <TableRow key={tes.id}>
                        <TableCell className="font-medium">{tes.name}</TableCell>
                        <TableCell className="text-muted-foreground">{tes.email}</TableCell>
                        <TableCell>
                          {tes.fraccionamiento?.nombre ?? (
                            <span className="text-muted-foreground italic">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tes.fraccionamiento ? (
                            tieneMp ? (
                              <span className="inline-flex items-center gap-1 text-sm text-green-700">
                                <CheckCircle className="h-4 w-4" />Configurado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm text-amber-600">
                                <AlertCircle className="h-4 w-4" />Pendiente
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => abrirEditar(tes)}>
                            Configurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de configuración */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Configurar tesorera</h2>
                <p className="text-sm text-muted-foreground">{editando.name} · {editando.email}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={cerrarModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Fraccionamiento asignado</label>
                <select
                  value={form.fraccionamientoId}
                  onChange={e => setForm(p => ({ ...p, fraccionamientoId: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin fraccionamiento</option>
                  {fraccionamientosDisponibles.map(f => (
                    <option key={f.id} value={f.id}>{f.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Mercado Pago
                </p>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Access Token
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (dejar vacío para conservar el actual)
                    </span>
                  </label>
                  <Input
                    type="password"
                    placeholder="APP_USR-..."
                    value={form.mercadoPagoAccessToken}
                    onChange={e => setForm(p => ({ ...p, mercadoPagoAccessToken: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Collector ID</label>
                  <Input
                    placeholder="123456789"
                    value={form.mercadoPagoCollectorId}
                    onChange={e => setForm(p => ({ ...p, mercadoPagoCollectorId: e.target.value }))}
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={cerrarModal}>Cancelar</Button>
              <Button onClick={guardar} disabled={asignarMut.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {asignarMut.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
