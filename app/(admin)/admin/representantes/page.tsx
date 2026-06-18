'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Circuito = {
  id: string;
  nombre: string;
  representanteId: string | null;
  mercadoPagoAccessToken: string | null;
  mercadoPagoCollectorId: string | null;
};

type Representante = {
  id: string;
  name: string;
  email: string;
  circuito: {
    id: string;
    nombre: string;
    mercadoPagoAccessToken: string | null;
    mercadoPagoCollectorId: string | null;
  } | null;
};

type FormState = {
  nombre: string;
  email: string;
  password: string;
  circuitoId: string;
  mercadoPagoAccessToken: string;
  mercadoPagoCollectorId: string;
};

const emptyForm: FormState = {
  nombre: '',
  email: '',
  password: '',
  circuitoId: '',
  mercadoPagoAccessToken: '',
  mercadoPagoCollectorId: '',
};

export default function AdminRepresentantesPage() {
  const router = useRouter();
  const [representantes, setRepresentantes] = useState<Representante[]>([]);
  const [circuitos, setCircuitos] = useState<Circuito[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editando, setEditando] = useState<Representante | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const circuitosDisponibles = useMemo(
    () =>
      circuitos.filter(
        (circuito) => !circuito.representanteId || circuito.representanteId === editando?.id
      ),
    [circuitos, editando]
  );

  async function cargar() {
    setCargando(true);
    setError(null);

    const [representantesRes, circuitosRes] = await Promise.all([
      fetch('/api/admin/representantes'),
      fetch('/api/admin/circuitos'),
    ]);

    if (!representantesRes.ok || !circuitosRes.ok) {
      setError('No se pudo cargar la informacion');
      setCargando(false);
      return;
    }

    const representantesData = await representantesRes.json();
    const circuitosData = await circuitosRes.json();
    setRepresentantes(representantesData.representantes ?? []);
    setCircuitos(circuitosData.circuitos ?? []);
    setCargando(false);
  }

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, []);

  function abrirCrear() {
    setEditando(null);
    setForm(emptyForm);
    setError(null);
    setMensaje(null);
    setModalAbierto(true);
  }

  function abrirEditar(representante: Representante) {
    setEditando(representante);
    setForm({
      nombre: representante.name,
      email: representante.email,
      password: '',
      circuitoId: representante.circuito?.id ?? '',
      mercadoPagoAccessToken: '',
      mercadoPagoCollectorId: representante.circuito?.mercadoPagoCollectorId ?? '',
    });
    setError(null);
    setMensaje(null);
    setModalAbierto(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);

    const payload = {
      nombre: form.nombre,
      email: form.email,
      ...(form.password ? { password: form.password } : {}),
      circuitoId: form.circuitoId || null,
      ...(form.mercadoPagoAccessToken ? { mercadoPagoAccessToken: form.mercadoPagoAccessToken } : {}),
      ...(form.mercadoPagoCollectorId ? { mercadoPagoCollectorId: form.mercadoPagoCollectorId } : {}),
    };

    const res = await fetch(
      editando ? `/api/admin/representantes/${editando.id}` : '/api/admin/representantes',
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? payload : { ...payload, password: form.password }),
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar el representante');
    } else {
      setMensaje(editando ? 'Representante actualizado' : 'Representante creado');
      setModalAbierto(false);
      await cargar();
    }

    setGuardando(false);
  }

  async function eliminar(representante: Representante) {
    const confirmar = window.confirm(`Eliminar a ${representante.name}?`);
    if (!confirmar) return;

    setError(null);
    setMensaje(null);
    const res = await fetch(`/api/admin/representantes/${representante.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo eliminar el representante');
      return;
    }

    setMensaje('Representante eliminado');
    await cargar();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Representantes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea cuentas, asigna circuitos y configura Mercado Pago.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={abrirCrear}>
              <Plus className="mr-2 h-4 w-4" />
              Crear
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin/circuitos')}>
              Circuitos
            </Button>
            <Button variant="outline" onClick={() => router.push('/admin')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Representantes registrados</CardTitle>
          </CardHeader>
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
                    <TableHead>Token MP</TableHead>
                    <TableHead>Collector ID</TableHead>
                    <TableHead className="w-44 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {representantes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        Sin representantes registrados.
                      </TableCell>
                    </TableRow>
                  )}
                  {representantes.map((representante) => (
                    <TableRow key={representante.id}>
                      <TableCell className="font-medium">{representante.name}</TableCell>
                      <TableCell>{representante.email}</TableCell>
                      <TableCell>
                        {representante.circuito?.nombre ?? (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {representante.circuito?.mercadoPagoAccessToken ?? (
                          <span className="text-muted-foreground">Pendiente</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {representante.circuito?.mercadoPagoCollectorId ?? (
                          <span className="text-muted-foreground">Pendiente</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => abrirEditar(representante)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button size="icon-sm" variant="destructive" onClick={() => eliminar(representante)}>
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
                  {editando ? 'Editar representante' : 'Crear representante'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {editando ? 'Actualiza datos y configuracion de cobro' : 'Se enviaran credenciales por correo'}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setModalAbierto(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Nombre</label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {editando ? 'Nueva contrasena' : 'Contrasena'}
                </label>
                <Input
                  type="password"
                  value={form.password}
                  placeholder={editando ? 'Dejar vacio para conservar' : 'Minimo 8 caracteres'}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Circuito</label>
                <select
                  value={form.circuitoId}
                  onChange={(e) => setForm((prev) => ({ ...prev, circuitoId: e.target.value }))}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Sin circuito</option>
                  {circuitosDisponibles.map((circuito) => (
                    <option key={circuito.id} value={circuito.id}>
                      {circuito.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Access Token Mercado Pago</label>
                <Input
                  type="password"
                  value={form.mercadoPagoAccessToken}
                  placeholder={editando ? 'Dejar vacio para conservar' : 'APP_USR...'}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, mercadoPagoAccessToken: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Collector ID</label>
                <Input
                  value={form.mercadoPagoCollectorId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, mercadoPagoCollectorId: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalAbierto(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardando ||
                  !form.nombre ||
                  !form.email ||
                  (!editando && form.password.length < 8)
                }
                onClick={guardar}
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
