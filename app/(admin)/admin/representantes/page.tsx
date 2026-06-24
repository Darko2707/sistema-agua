'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Save, X, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { trpcReact } from '@/lib/trpc-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

type Representante = {
  id: string;
  name: string;
  email: string;
  circuito: {
    id: string;
    nombre: string;
    representanteId: string | null;
  } | null | undefined;
};

export default function AdminRepresentantesPage() {
  const router = useRouter();
  const utils  = trpcReact.useUtils();

  const [editando,     setEditando]     = useState<Representante | null>(null);
  const [circuitoSel,  setCircuitoSel]  = useState('');
  const [error,        setError]        = useState<string | null>(null);
  const [mensaje,      setMensaje]      = useState<string | null>(null);

  const repsQuery      = trpcReact.usuarios.listarRepresentantes.useQuery();
  const circuitosQuery = trpcReact.circuitos.listar.useQuery();

  const representantes = repsQuery.data      ?? [];
  const circuitos      = circuitosQuery.data  ?? [];
  const cargando       = repsQuery.isLoading;

  // Circuitos libres + el circuito actual del representante que se edita
  const circuitosDisponibles = useMemo(
    () => circuitos.filter(c => !c.representanteId || c.representanteId === editando?.id),
    [circuitos, editando],
  );

  const actualizarMut = trpcReact.usuarios.actualizarRepresentante.useMutation();

  function abrirEditar(rep: Representante) {
    setEditando(rep);
    setCircuitoSel(rep.circuito?.id ?? '');
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
    setMensaje(null);
    try {
      await actualizarMut.mutateAsync({
        id: editando.id,
        circuitoId: circuitoSel || null,
      });
      setMensaje('Circuito asignado correctamente');
      setEditando(null);
      void utils.usuarios.listarRepresentantes.invalidate();
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
            <h1 className="text-3xl font-bold">Representantes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Asigna circuitos a los representantes del sistema.
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
            Para añadir un representante, cambia el rol de un residente a{' '}
            <strong>Representante</strong> desde la pestaña{' '}
            <strong>Personal</strong> en el panel de administrador (o pídele al representante que lo haga desde su panel).
            Después aparecerá en esta lista para asignarle un circuito.
          </p>
        </div>

        {error   && <div className="rounded-lg border border-red-200   bg-red-50   p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Representantes registrados</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <p className="py-10 text-center text-muted-foreground">Cargando...</p>
            ) : representantes.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                No hay usuarios con rol de representante. Asigna el rol desde la pestaña Personal.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Circuito asignado</TableHead>
                    <TableHead className="w-28 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {representantes.map((rep) => (
                    <TableRow key={rep.id}>
                      <TableCell className="font-medium">{rep.name}</TableCell>
                      <TableCell className="text-muted-foreground">{rep.email}</TableCell>
                      <TableCell>
                        {rep.circuito?.nombre ?? (
                          <span className="text-muted-foreground italic">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirEditar(rep)}>
                          Asignar circuito
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de asignación */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Asignar circuito</h2>
                <p className="text-sm text-muted-foreground">{editando.name}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={cerrarModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Circuito</label>
                <select
                  value={circuitoSel}
                  onChange={e => setCircuitoSel(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin circuito</option>
                  {circuitosDisponibles.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
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
