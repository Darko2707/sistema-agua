'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trpcReact } from '@/lib/trpc-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type FormState = {
  nombre: string;
  email: string;
  password: string;
  circuitoId: string;
  mercadoPagoAccessToken: string;
  mercadoPagoCollectorId: string;
};

type Tesorera = {
  id: string;
  name: string;
  email: string;
  circuito: {
    id: string;
    nombre: string;
    tesoreraId: string | null;
    mercadoPagoAccessToken: string | null;
    mercadoPagoCollectorId: string | null;
    activo: boolean;
    montoMensual: string;
    montoReconexion: string;
  } | null | undefined;
};

const emptyForm: FormState = {
  nombre: '', email: '', password: '', circuitoId: '',
  mercadoPagoAccessToken: '', mercadoPagoCollectorId: '',
};

export default function AdminTesorerasPage() {
  const router = useRouter();
  const utils  = trpcReact.useUtils();

  const [editando,     setEditando]     = useState<Tesorera | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form,         setForm]         = useState<FormState>(emptyForm);
  const [error,        setError]        = useState<string | null>(null);
  const [mensaje,      setMensaje]      = useState<string | null>(null);

  const tesorerasQuery = trpcReact.usuarios.listarTesoreras.useQuery();
  const circuitosQuery = trpcReact.circuitos.listar.useQuery();

  const tesoreras = tesorerasQuery.data ?? [];
  const circuitos = circuitosQuery.data ?? [];
  const cargando  = tesorerasQuery.isLoading;

  const circuitosDisponibles = useMemo(
    () => circuitos.filter((c) => !c.tesoreraId || c.tesoreraId === editando?.id),
    [circuitos, editando],
  );

  const crearMut      = trpcReact.usuarios.crearTesorera.useMutation();
  const actualizarMut = trpcReact.usuarios.actualizarTesorera.useMutation();
  const eliminarMut   = trpcReact.usuarios.eliminarTesorera.useMutation();

  function recargar() {
    void utils.usuarios.listarTesoreras.invalidate();
    void utils.circuitos.listar.invalidate();
  }

  function abrirCrear() {
    setEditando(null);
    setForm(emptyForm);
    setError(null);
    setMensaje(null);
    setModalAbierto(true);
  }

  function abrirEditar(tes: Tesorera) {
    setEditando(tes);
    setForm({
      nombre: tes.name,
      email: tes.email,
      password: '',
      circuitoId: tes.circuito?.id ?? '',
      mercadoPagoAccessToken: '',
      mercadoPagoCollectorId: tes.circuito?.mercadoPagoCollectorId ?? '',
    });
    setError(null);
    setMensaje(null);
    setModalAbierto(true);
  }

  async function guardar() {
    setError(null);
    setMensaje(null);
    try {
      if (editando) {
        await actualizarMut.mutateAsync({
          id: editando.id,
          ...(form.nombre !== editando.name ? { nombre: form.nombre } : {}),
          ...(form.email  !== editando.email ? { email: form.email }  : {}),
          ...(form.password ? { password: form.password } : {}),
          circuitoId: form.circuitoId || null,
          ...(form.mercadoPagoAccessToken ? { mercadoPagoAccessToken: form.mercadoPagoAccessToken } : {}),
          ...(form.mercadoPagoCollectorId ? { mercadoPagoCollectorId: form.mercadoPagoCollectorId } : {}),
        });
        setMensaje('Tesorera actualizada');
      } else {
        await crearMut.mutateAsync({
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          ...(form.circuitoId ? { circuitoId: form.circuitoId } : {}),
          ...(form.mercadoPagoAccessToken ? { mercadoPagoAccessToken: form.mercadoPagoAccessToken } : {}),
          ...(form.mercadoPagoCollectorId ? { mercadoPagoCollectorId: form.mercadoPagoCollectorId } : {}),
        });
        setMensaje('Tesorera creada');
      }
      setModalAbierto(false);
      recargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la tesorera');
    }
  }

  async function eliminar(tes: Tesorera) {
    if (!window.confirm(`¿Eliminar a ${tes.name}?`)) return;
    setError(null);
    setMensaje(null);
    try {
      await eliminarMut.mutateAsync({ id: tes.id });
      setMensaje('Tesorera eliminada');
      recargar();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la tesorera');
    }
  }

  const guardando = crearMut.isPending || actualizarMut.isPending;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tesoreras</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea cuentas, asigna circuitos y configura Mercado Pago.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={abrirCrear}>
              <Plus className="mr-2 h-4 w-4" />Crear
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin')}>
              <ArrowLeft className="mr-2 h-4 w-4" />Volver
            </Button>
          </div>
        </div>

        {error   && <div className="rounded-lg border border-red-200   bg-red-50   p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader><CardTitle>Tesoreras registradas</CardTitle></CardHeader>
          <CardContent>
            {cargando ? (
              <p className="py-10 text-center text-muted-foreground">Cargando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Circuito</TableHead>
                    <TableHead>Collector ID</TableHead>
                    <TableHead className="w-44 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tesoreras.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Sin tesoreras registradas.
                      </TableCell>
                    </TableRow>
                  )}
                  {tesoreras.map((tes) => (
                    <TableRow key={tes.id}>
                      <TableCell className="font-medium">{tes.name}</TableCell>
                      <TableCell>{tes.email}</TableCell>
                      <TableCell>
                        {tes.circuito?.nombre ?? <span className="text-muted-foreground">Sin asignar</span>}
                      </TableCell>
                      <TableCell>
                        {tes.circuito?.mercadoPagoCollectorId ?? <span className="text-muted-foreground">Pendiente</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => abrirEditar(tes)}>
                            <Pencil className="mr-2 h-4 w-4" />Editar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => eliminar(tes)} disabled={eliminarMut.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {editando ? 'Editar tesorera' : 'Crear tesorera'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {editando ? 'Actualiza datos y configuración de cobro' : 'Se crearán las credenciales de acceso'}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setModalAbierto(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Nombre</label>
                <Input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {editando ? 'Nueva contraseña' : 'Contraseña'}
                </label>
                <Input
                  type="password"
                  value={form.password}
                  placeholder={editando ? 'Dejar vacío para conservar' : 'Mínimo 8 caracteres'}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Circuito</label>
                <select
                  value={form.circuitoId}
                  onChange={(e) => setForm((p) => ({ ...p, circuitoId: e.target.value }))}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Sin circuito</option>
                  {circuitosDisponibles.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Access Token Mercado Pago</label>
                <Input
                  type="password"
                  value={form.mercadoPagoAccessToken}
                  placeholder={editando ? 'Dejar vacío para conservar' : 'APP_USR...'}
                  onChange={(e) => setForm((p) => ({ ...p, mercadoPagoAccessToken: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Collector ID</label>
                <Input
                  value={form.mercadoPagoCollectorId}
                  onChange={(e) => setForm((p) => ({ ...p, mercadoPagoCollectorId: e.target.value }))}
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalAbierto(false)}>Cancelar</Button>
              <Button
                disabled={guardando || !form.nombre || !form.email || (!editando && form.password.length < 8)}
                onClick={guardar}
              >
                <Save className="mr-2 h-4 w-4" />Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
