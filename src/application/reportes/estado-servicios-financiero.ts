export type PeriodoFinanciero = { mes: number; anio: number };

export type EstadoServicioFinanciero = {
  residenteNombre: string;
  edificio: string;
  departamento: string;
  fraccionamiento: string;
  servicio: string;
  estado: 'pagado' | 'pendiente';
  metodo: string | null;
  monto: number;
  mes: number;
  anio: number;
};

type PerfilFinanciero = {
  id: string;
  edificio?: string | null;
  departamento?: string | null;
  creadoEn?: Date | null;
  usuario?: { name?: string | null; responsableCargos?: boolean | null } | null;
};

type ServicioFinanciero = {
  id: string;
  montoMensual: string;
  estado?: string;
  creadoEn?: Date | null;
  servicio?: { clave?: string | null; nombre?: string | null; activo?: boolean } | null;
};

type PagoFinanciero = {
  perfilId: string;
  mes: number;
  anio: number;
  monto: string;
  montoBase?: string | null;
  montoNetoRepresentante?: string | null;
  estado?: string | null;
  metodo?: string | null;
  creadoEn?: Date | null;
};

type CargoFinanciero = {
  id: string;
  perfilId: string;
  fraccionamientoServicioId: string;
  mes: number;
  anio: number;
  monto: string;
  estado?: string | null;
  metodo?: string | null;
};

function amountForFraccionamiento(payment: PagoFinanciero) {
  return Number(payment.montoNetoRepresentante ?? payment.montoBase ?? payment.monto);
}

/** Reconstruye cargos esperados y su estado usando perfiles, activaciones y ledger. */
export function buildEstadoServiciosFinanciero(
  fraccionamiento: string,
  periodos: PeriodoFinanciero[],
  perfiles: PerfilFinanciero[],
  servicios: ServicioFinanciero[],
  pagosAgua: PagoFinanciero[],
  cargos: CargoFinanciero[],
): EstadoServicioFinanciero[] {
  const result: EstadoServicioFinanciero[] = [];
  const periodIndex = (month: number, year: number) => year * 12 + month;

  for (const period of periodos) {
    for (const perfil of perfiles) {
      if (!perfil.usuario?.responsableCargos) continue;
      for (const activation of servicios) {
        const service = activation.servicio;
        if (!service?.nombre || !service.clave) continue;
        const cargo = cargos.find(row => row.perfilId === perfil.id
          && row.fraccionamientoServicioId === activation.id
          && row.mes === period.mes && row.anio === period.anio);
        if (cargo?.estado === 'cancelado') continue;
        if ((!service.activo || activation.estado === 'inactivo') && !cargo) continue;

        const periodNumber = periodIndex(period.mes, period.anio);
        const residentStart = perfil.creadoEn ? periodIndex(perfil.creadoEn.getMonth() + 1, perfil.creadoEn.getFullYear()) : 0;
        const serviceStart = activation.creadoEn ? periodIndex(activation.creadoEn.getMonth() + 1, activation.creadoEn.getFullYear()) : 0;
        if (periodNumber < Math.max(residentStart, serviceStart)) continue;

        // Pending retries can coexist in `pagos`; count only one expected water charge per home/period.
        const waterPayment = service.clave === 'agua'
          ? pagosAgua.filter(payment => payment.perfilId === perfil.id
            && payment.mes === period.mes && payment.anio === period.anio
            && ['pagado', 'pendiente', 'vencido'].includes(payment.estado ?? ''))
            .sort((a, b) => (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0))
            .find(payment => payment.estado === 'pagado')
            ?? pagosAgua.filter(payment => payment.perfilId === perfil.id
              && payment.mes === period.mes && payment.anio === period.anio
              && ['pendiente', 'vencido'].includes(payment.estado ?? ''))
              .sort((a, b) => (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0))[0]
          : undefined;

        const confirmed = waterPayment?.estado === 'pagado' || cargo?.estado === 'pagado';
        result.push({
          residenteNombre: perfil.usuario?.name ?? 'Sin asignar',
          edificio: perfil.edificio ?? '',
          departamento: perfil.departamento ?? '',
          fraccionamiento,
          servicio: service.nombre,
          estado: confirmed ? 'pagado' : 'pendiente',
          metodo: waterPayment?.metodo ?? cargo?.metodo ?? null,
          monto: waterPayment
            ? amountForFraccionamiento(waterPayment)
            : cargo ? Number(cargo.monto) : Number(activation.montoMensual),
          mes: period.mes,
          anio: period.anio,
        });
      }
    }
  }

  return result;
}
