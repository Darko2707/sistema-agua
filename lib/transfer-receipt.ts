export type TransferReceiptItem = {
  descripcion: string;
  mes: number;
  anio: number;
  monto: string;
  tipo: 'agua' | 'servicio';
};

type PagoReciboSource = {
  mes: number;
  anio: number;
  monto: string;
  estado: string | null;
  esReconexion?: boolean | null;
};

type CargoReciboSource = {
  id: string;
  mes: number;
  anio: number;
  monto: string;
  estado: string | null;
  servicioNombre: string;
};

export function buildTransferReceiptItems(input: {
  mesesSeleccionados: Array<{ mes: number; anio: number }>;
  pagos: PagoReciboSource[];
  cargosSeleccionados: string[];
  cargos: CargoReciboSource[];
}): TransferReceiptItem[] {
  const periodos = new Set(input.mesesSeleccionados.map(({ mes, anio }) => `${anio}-${mes}`));
  const cargoIds = new Set(input.cargosSeleccionados);
  const items: TransferReceiptItem[] = [];

  for (const pago of input.pagos) {
    if (pago.estado !== 'pagado' || !periodos.has(`${pago.anio}-${pago.mes}`)) continue;
    items.push({
      descripcion: pago.esReconexion ? 'Agua y reconexión' : 'Agua',
      mes: pago.mes,
      anio: pago.anio,
      monto: pago.monto,
      tipo: 'agua',
    });
  }

  for (const cargo of input.cargos) {
    if (cargo.estado !== 'pagado' || !cargoIds.has(cargo.id)) continue;
    items.push({
      descripcion: cargo.servicioNombre,
      mes: cargo.mes,
      anio: cargo.anio,
      monto: cargo.monto,
      tipo: 'servicio',
    });
  }

  return items.sort((a, b) => a.anio - b.anio || a.mes - b.mes || a.descripcion.localeCompare(b.descripcion, 'es'));
}

export function sumTransferReceiptItems(items: TransferReceiptItem[]): string {
  const cents = items.reduce((sum, item) => sum + Math.round(Number(item.monto) * 100), 0);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
