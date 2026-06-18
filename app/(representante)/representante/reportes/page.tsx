'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Pago = {
  id: string;
  folio: string | null;
  mes: number;
  anio: number;
  monto: string;
  montoBase: string | null;
  iva: string | null;
  comisionMercadoPago: string | null;
  retencionIsr: string | null;
  retencionIva: string | null;
  montoNetoRepresentante: string | null;
  edificio: string;
  departamento: string;
};

type MercadoPagoConfig = {
  id: string;
  nombre: string;
};

function moneda(valor: string | number | null) {
  return Number(valor ?? 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

export default function RepresentanteReportesPage() {
  const router = useRouter();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [circuito, setCircuito] = useState<MercadoPagoConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    const [pagosRes, mpRes] = await Promise.all([
      fetch('/api/representante/pagos'),
      fetch('/api/representante/mercadopago'),
    ]);

    if (pagosRes.ok) {
      const data = await pagosRes.json();
      setPagos(data.pagos ?? []);
    } else {
      setError('No se pudieron cargar los pagos');
    }

    if (mpRes.ok) {
      const data = await mpRes.json();
      setCircuito(data.circuito);
    }

    setCargando(false);
  }

  useEffect(() => {
    void Promise.resolve().then(cargar);
  }, []);

  const totales = useMemo(
    () =>
      pagos.reduce(
        (acc, pago) => ({
          base: acc.base + Number(pago.montoBase ?? 0),
          iva: acc.iva + Number(pago.iva ?? 0),
          comision: acc.comision + Number(pago.comisionMercadoPago ?? 0),
          isr: acc.isr + Number(pago.retencionIsr ?? 0),
          ivaRetenido: acc.ivaRetenido + Number(pago.retencionIva ?? 0),
          neto: acc.neto + Number(pago.montoNetoRepresentante ?? 0),
        }),
        { base: 0, iva: 0, comision: 0, isr: 0, ivaRetenido: 0, neto: 0 }
      ),
    [pagos]
  );

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Reportes de pagos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {circuito?.nombre ?? 'Circuito sin asignar'}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/representante')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Base</p>
              <p className="text-2xl font-bold">{moneda(totales.base)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Comisiones y retenciones</p>
              <p className="text-2xl font-bold">{moneda(totales.comision + totales.isr + totales.ivaRetenido)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Neto representante</p>
              <p className="text-2xl font-bold text-green-600">{moneda(totales.neto)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Desglose de pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Comision MP</TableHead>
                  <TableHead>ISR</TableHead>
                  <TableHead>IVA retenido</TableHead>
                  <TableHead>Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Sin pagos registrados.
                    </TableCell>
                  </TableRow>
                )}
                {pagos.map((pago) => (
                  <TableRow key={pago.id}>
                    <TableCell>{pago.mes}/{pago.anio}</TableCell>
                    <TableCell>{pago.edificio} - {pago.departamento}</TableCell>
                    <TableCell>{moneda(pago.montoBase)}</TableCell>
                    <TableCell>{moneda(pago.iva)}</TableCell>
                    <TableCell>{moneda(pago.comisionMercadoPago)}</TableCell>
                    <TableCell>{moneda(pago.retencionIsr)}</TableCell>
                    <TableCell>{moneda(pago.retencionIva)}</TableCell>
                    <TableCell className="font-medium text-green-700">
                      {moneda(pago.montoNetoRepresentante)}
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
