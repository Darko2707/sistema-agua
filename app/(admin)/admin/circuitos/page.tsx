'use client';

import { useEffect, useState } from 'react';
import { Save, ArrowLeft } from 'lucide-react';
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
  montoMensual: string;
  mercadoPagoAccessToken: string | null;
  mercadoPagoCollectorId: string | null;
  representante: { name: string; email: string } | null;
};

export default function AdminCircuitosPage() {
  const router = useRouter();
  const [circuitos, setCircuitos] = useState<Circuito[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const res = await fetch('/api/admin/circuitos');
    if (!res.ok) {
      setError('No se pudieron cargar los circuitos');
      setCargando(false);
      return;
    }

    const data = await res.json();
    const lista = data.circuitos ?? [];
    setCircuitos(lista);
    setMontos(Object.fromEntries(lista.map((c: Circuito) => [c.id, c.montoMensual])));
    setCargando(false);
  }

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, []);

  async function guardar(circuito: Circuito) {
    setGuardando(circuito.id);
    setError(null);
    setMensaje(null);

    const monto = Number(montos[circuito.id]);
    const res = await fetch(`/api/admin/circuitos/${circuito.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montoMensual: monto }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'No se pudo guardar el monto');
    } else {
      setMensaje(`Monto actualizado para ${circuito.nombre}`);
      await cargar();
    }

    setGuardando(null);
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Cuotas por circuito</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Edita el monto mensual que se usa al generar pagos.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/admin')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{mensaje}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Circuitos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Circuito</TableHead>
                  <TableHead>Representante</TableHead>
                  <TableHead>Mercado Pago</TableHead>
                  <TableHead className="w-44">Monto mensual</TableHead>
                  <TableHead className="w-28 text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circuitos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>
                      {c.representante ? (
                        <span>
                          {c.representante.name}
                          <span className="block text-xs text-muted-foreground">{c.representante.email}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin asignar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.mercadoPagoCollectorId ? (
                        <span className="text-sm">{c.mercadoPagoCollectorId}</span>
                      ) : (
                        <span className="text-muted-foreground">Pendiente</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        step="0.01"
                        value={montos[c.id] ?? ''}
                        onChange={(e) => setMontos((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={guardando === c.id}
                        onClick={() => guardar(c)}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Guardar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
