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
  circuito: {
    id: string;
    nombre: string;
    tesoreraId: string | null;
    mercadoPagoCollectorId: string | null;
    mercadoPagoAccessToken: string | null;
  } | null | undefined;
};

type FormState = {
  circuitoId:             string;
  mercadoPagoAccessToken: string;
  mercadoPagoCollectorId: string;
};

const emptyForm: FormState = {
  circuitoId:             '',
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
  const circuitosQuery = trpcReact.circuitos.listar.useQuery();

  const tesoreras = tesorerasQuery.data ?? [];
  const circuitos = circuitosQuery.data ?? [];
  const cargando  = tesorerasQuery.isLoading;

  // Circuitos disponibles: sin tesorera o el circuito actual de la que se edita
  const circuitosDisponibles = useMemo(
    () => circuitos.filter(c => !c.tesoreraId || c.tesoreraId === editando?.id),
    [circuitos, editando],
  );

  const actualizarMut = trpcReact.usuarios.actualizarTesorera.useMutation();

  function abrirEditar(tes: Tesorera) {
    setEditando(tes);
    setForm({
      circuitoId:             tes.circuito?.id ?? '',
      mercadoPagoAccessToken: '',
      mercadoPagoCollectorId: tes.circuito?.mercadoPagoCollectorId ?? '',
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
    try {
      await actualizarMut.mutateAsync({
        id:         editando.id,
        circuitoId: form.circuitoId || null,
        ...(form.mercadoPagoAccessToken ? { mercadoPagoAccessToken: form.mercadoPagoAccessToken } : {}),
        ...(form.mercadoPagoCollectorId ? { mercadoPagoCollectorId: form.mercadoPagoCollectorId } : {}),
      });
      setMensaje('Configuración guardada correctamente');
      setEditando(null);
      void utils.usuarios.listarTesoreras.invalidate();
      void utils.circuitos.listar.invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tesorero/a</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Asigna circuitos y configura Mercado Pago para cada tesorero/a.
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
            <strong>Tesorero/a</strong> desde la pestaña{' '}
            <strong>Personal</strong> en el panel de administrador.
            Después aparecerá aquí para asignarle un circuito y sus credenciales de Mercado Pago.
          </p>
        </div>

        {error   && <div className="rounded-lg border border-red-200   bg-red-50   p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Tesorero/a registrados</CardTitle>
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
                    <TableHead>Circuito</TableHead>
                    <TableHead>Mercado Pago</TableHead>
                    <TableHead className="w-28 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tesoreras.map((tes) => {
                    const tieneMp = !!tes.circuito?.mercadoPagoCollectorId;
                    return (
                      <TableRow key={tes.id}>
                        <TableCell className="font-medium">{tes.name}</TableCell>
                        <TableCell className="text-muted-foreground">{tes.email}</TableCell>
                        <TableCell>
                          {tes.circuito?.nombre ?? (
                            <span className="text-muted-foreground italic">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tes.circuito ? (
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
                <label className="mb-2 block text-sm font-medium">Circuito asignado</label>
                <select
                  value={form.circuitoId}
                  onChange={e => setForm(p => ({ ...p, circuitoId: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin circuito</option>
                  {circuitosDisponibles.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
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
              <Button onClick={guardar} disabled={actualizarMut.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {actualizarMut.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
