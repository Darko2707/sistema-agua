'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Save, X } from 'lucide-react';
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

type Representante = {
  id: string;
  name: string;
  email: string;
};

type Circuito = {
  id: string;
  nombre: string;
  representanteId: string | null;
  representante: Representante | null;
  montoMensual: string;
  montoReconexion: string;
};

type FormState = {
  montoMensual: string;
  montoReconexion: string;
  representanteId: string;
};

function moneda(valor: string | number) {
  return Number(valor).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function AdminCircuitosPage() {
  const router = useRouter();
  const [circuitos, setCircuitos] = useState<Circuito[]>([]);
  const [representantes, setRepresentantes] = useState<Representante[]>([]);
  const [editando, setEditando] = useState<Circuito | null>(null);
  const [form, setForm] = useState<FormState>({
    montoMensual: '',
    montoReconexion: '',
    representanteId: '',
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);

    const [circuitosRes, representantesRes] = await Promise.all([
      fetch('/api/admin/circuitos'),
      fetch('/api/admin/representantes'),
    ]);

    if (!circuitosRes.ok || !representantesRes.ok) {
      setError('No se pudo cargar la configuracion');
      setCargando(false);
      return;
    }

    const circuitosData = await circuitosRes.json();
    const representantesData = await representantesRes.json();
    setCircuitos(circuitosData.circuitos ?? []);
    setRepresentantes(representantesData.representantes ?? []);
    setCargando(false);
  }

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, []);

  function abrirModal(circuito: Circuito) {
    setEditando(circuito);
    setForm({
      montoMensual: circuito.montoMensual,
      montoReconexion: circuito.montoReconexion,
      representanteId: circuito.representanteId ?? '',
    });
    setError(null);
    setMensaje(null);
  }

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);

    const res = await fetch(`/api/admin/circuitos/${editando.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        montoMensual: Number(form.montoMensual),
        montoReconexion: Number(form.montoReconexion),
        representanteId: form.representanteId || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar el circuito');
    } else {
      setMensaje(`Configuracion actualizada para ${editando.nombre}`);
      setEditando(null);
      await cargar();
    }

    setGuardando(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Circuitos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configura cuotas, reconexion y representante por circuito.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/representantes')}>
              Representantes
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
            <CardTitle>Configuracion por circuito</CardTitle>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <p className="py-10 text-center text-muted-foreground">Cargando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Circuito</TableHead>
                    <TableHead>Representante</TableHead>
                    <TableHead>Mensual</TableHead>
                    <TableHead>Reconexion</TableHead>
                    <TableHead className="w-24 text-right">Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {circuitos.map((circuito) => (
                    <TableRow key={circuito.id}>
                      <TableCell className="font-medium">{circuito.nombre}</TableCell>
                      <TableCell>
                        {circuito.representante ? (
                          <span>
                            {circuito.representante.name}
                            <span className="block text-xs text-muted-foreground">
                              {circuito.representante.email}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>{moneda(circuito.montoMensual)}</TableCell>
                      <TableCell>{moneda(circuito.montoReconexion)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirModal(circuito)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
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

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{editando.nombre}</h2>
                <p className="text-sm text-muted-foreground">Editar configuracion del circuito</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditando(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Monto mensual</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.montoMensual}
                  onChange={(e) => setForm((prev) => ({ ...prev, montoMensual: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Monto de reconexion</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montoReconexion}
                  onChange={(e) => setForm((prev) => ({ ...prev, montoReconexion: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Representante</label>
                <select
                  value={form.representanteId}
                  onChange={(e) => setForm((prev) => ({ ...prev, representanteId: e.target.value }))}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Sin representante</option>
                  {representantes.map((representante) => (
                    <option key={representante.id} value={representante.id}>
                      {representante.name} ({representante.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button disabled={guardando} onClick={guardar}>
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
