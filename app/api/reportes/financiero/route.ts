import { auth } from '@/lib/auth';
import { db } from '@/db';
import { and, eq, isNull } from 'drizzle-orm';
import {
  generarReporteFinancieroExcel,
  generarReporteFinancieroRangoExcel,
} from '@/server/services/excel-reportes';
import type {
  IngresoAdicionalReporte,
  GastoRangoReporte,
  IngresoRangoReporte,
  MesResumen,
  PagoReporteItem,
  TotalPorServicio,
} from '@/server/services/excel-reportes';
import { MESES_CORTO as MESES_ES } from '@/lib/meses';
import { guardReportExport } from '@/lib/report-export-guard';

export const dynamic = 'force-dynamic';
const MAX_RANGO_MESES = 36;

// Genera la lista de periodos entre dos meses, inclusive.
function getMesesEnRango(
  mesDesde: number, anioDesde: number,
  mesHasta: number, anioHasta: number,
): Array<{ mes: number; anio: number }> {
  const result: Array<{ mes: number; anio: number }> = [];
  let m = mesDesde;
  let a = anioDesde;
  while (a < anioHasta || (a === anioHasta && m <= mesHasta)) {
    result.push({ mes: m, anio: a });
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return result;
}

function isMesValido(mes: number): boolean {
  return Number.isInteger(mes) && mes >= 1 && mes <= 12;
}

function isAnioValido(anio: number): boolean {
  return Number.isInteger(anio) && anio >= 2020 && anio <= 2100;
}

function montoDisponibleFraccionamiento(pago: {
  monto: string;
  montoBase?: string | null;
  montoNetoRepresentante?: string | null;
}) {
  // En pagos con tarjeta, `monto` puede incluir comisiones. El reporte financiero
  // debe sumar lo disponible para el circuito para que cuadre con caja.
  return Number(pago.montoNetoRepresentante ?? pago.montoBase ?? pago.monto);
}

function mapearPagosReporte(
  fraccionamientoNombre: string,
  pagos: Array<{
    id: string;
    mes: number;
    anio: number;
    monto: string;
    montoBase?: string | null;
    montoNetoRepresentante?: string | null;
    folio?: string | null;
    estado?: string | null;
    metodo?: string | null;
    mercadoPagoPaymentId?: string | null;
    esReconexion?: boolean | null;
    fechaPago?: Date | null;
    creadoEn?: Date | null;
    perfil?: {
      edificio?: string | null;
      departamento?: string | null;
      usuario?: { name?: string | null } | null;
    } | null;
  }>,
  cargos: Array<{
    id: string;
    mes: number;
    anio: number;
    monto: string;
    folio?: string | null;
    estado?: string | null;
    metodo?: string | null;
    mercadoPagoPaymentId?: string | null;
    pagadoEn?: Date | null;
    creadoEn?: Date | null;
    perfil?: {
      edificio?: string | null;
      departamento?: string | null;
      usuario?: { name?: string | null } | null;
    } | null;
    fraccionamientoServicio?: {
      servicio?: {
        clave?: string | null;
        nombre?: string | null;
      } | null;
    } | null;
  }>,
): { pagosReporte: PagoReporteItem[]; totalesPorServicio: TotalPorServicio[] } {
  const cargosFiltrados = cargos.filter(
    (c) => c.fraccionamientoServicio?.servicio?.clave !== 'agua',
  );

  const pagosAgua: PagoReporteItem[] = pagos.map((p) => {
    const mesNombre = MESES_ES[p.mes - 1] ?? `Mes ${p.mes}`;
    const concepto = p.esReconexion
      ? `Reconexión de agua — ${mesNombre} ${p.anio}`
      : `Cuota de agua — ${mesNombre} ${p.anio}`;
    return {
      id: p.id,
      fecha: p.fechaPago ?? p.creadoEn ?? new Date(),
      folio: p.folio ?? p.id,
      residenteNombre: p.perfil?.usuario?.name ?? 'Sin asignar',
      edificio: p.perfil?.edificio ?? '',
      departamento: p.perfil?.departamento ?? '',
      fraccionamiento: fraccionamientoNombre,
      servicio: 'Agua',
      concepto,
      monto: montoDisponibleFraccionamiento(p),
      estado: p.estado ?? 'pagado',
      metodo: p.metodo ?? 'efectivo',
      referenciaExterna: p.mercadoPagoPaymentId ?? null,
      mes: p.mes,
      anio: p.anio,
    };
  });

  const pagosServicios: PagoReporteItem[] = cargosFiltrados.map((c) => {
    const servNombre = c.fraccionamientoServicio?.servicio?.nombre ?? 'Servicio';
    const mesNombre = MESES_ES[c.mes - 1] ?? `Mes ${c.mes}`;
    const concepto = `Cuota ${servNombre.toLowerCase()} — ${mesNombre} ${c.anio}`;
    return {
      id: c.id,
      fecha: c.pagadoEn ?? c.creadoEn ?? new Date(),
      folio: c.folio ?? c.id,
      residenteNombre: c.perfil?.usuario?.name ?? 'Sin asignar',
      edificio: c.perfil?.edificio ?? '',
      departamento: c.perfil?.departamento ?? '',
      fraccionamiento: fraccionamientoNombre,
      servicio: servNombre,
      concepto,
      monto: Number(c.monto),
      estado: c.estado ?? 'pagado',
      metodo: c.metodo ?? 'efectivo',
      referenciaExterna: c.mercadoPagoPaymentId ?? null,
      mes: c.mes,
      anio: c.anio,
    };
  });

  const pagosReporte = [...pagosAgua, ...pagosServicios].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  const serviciosMap = new Map<string, { total: number; cantidad: number }>();
  for (const pago of pagosReporte) {
    const s = serviciosMap.get(pago.servicio) ?? { total: 0, cantidad: 0 };
    s.total += pago.monto;
    s.cantidad += 1;
    serviciosMap.set(pago.servicio, s);
  }

  const totalesPorServicio: TotalPorServicio[] = Array.from(serviciosMap.entries()).map(
    ([servicio, data]) => ({ servicio, total: data.total, cantidad: data.cantidad }),
  );

  return { pagosReporte, totalesPorServicio };
}

async function resolverFraccionamiento(userId: string, fraccionamientoId: string) {
  const fraccionamiento = await db.query.fraccionamientos.findFirst({
    where: (f, { eq, and }) => and(eq(f.id, fraccionamientoId), eq(f.tesoreraId, userId), eq(f.activo, true)),
  });
  return fraccionamiento ?? null;
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  const dbUser = await db.query.user.findFirst({
    where: (u) => and(eq(u.id, session.user.id), isNull(u.deletedAt)),
  });
  if (dbUser?.role !== 'tesorera') return new Response('Prohibido', { status: 403 });
  if (!dbUser.fraccionamientoId) return new Response('Cuenta sin fraccionamiento', { status: 403 });

  const exportGuard = await guardReportExport(session.user.id);
  if (!exportGuard.allowed) return exportGuard.response;

  try {

  const fraccionamiento = await resolverFraccionamiento(session.user.id, dbUser.fraccionamientoId);
  if (!fraccionamiento) return new Response('Sin fraccionamiento activo asignado', { status: 404 });

  const url      = new URL(req.url);
  const mesDesdeRaw  = url.searchParams.get('mesDesde');
  const anioDesdeRaw = url.searchParams.get('anioDesde');
  const mesHastaRaw  = url.searchParams.get('mesHasta');
  const anioHastaRaw = url.searchParams.get('anioHasta');

  // Exportación por rango: se usa para cierres mensuales y auditoría de tesorería.
  if (mesDesdeRaw && anioDesdeRaw && mesHastaRaw && anioHastaRaw) {
    const mesDesde  = parseInt(mesDesdeRaw,  10);
    const anioDesde = parseInt(anioDesdeRaw, 10);
    const mesHasta  = parseInt(mesHastaRaw,  10);
    const anioHasta = parseInt(anioHastaRaw, 10);

    if (!isMesValido(mesDesde) || !isMesValido(mesHasta) || !isAnioValido(anioDesde) || !isAnioValido(anioHasta))
      return new Response('Parámetros inválidos', { status: 400 });

    const desdeNum = anioDesde * 100 + mesDesde;
    const hastaNum = anioHasta * 100 + mesHasta;
    if (hastaNum < desdeNum)
      return new Response('El rango de fechas es inválido', { status: 400 });

    const mesesLista = getMesesEnRango(mesDesde, anioDesde, mesHasta, anioHasta);
    if (mesesLista.length > MAX_RANGO_MESES)
      return new Response('El rango no puede exceder 36 meses', { status: 400 });

    const [residentes, pagosTodos, cargosServiciosTodos, gastosTodos, ingresosTodos] = await Promise.all([
      db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.fraccionamientoId, fraccionamiento.id),
      }),
      db.query.pagos.findMany({
        where: (p, { eq, and, or }) => and(
          eq(p.fraccionamientoId, fraccionamiento.id),
          eq(p.estado, 'pagado'),
          or(...mesesLista.map(m => and(eq(p.mes, m.mes), eq(p.anio, m.anio)))),
        ),
        with: { perfil: { with: { usuario: true } } },
      }),
      db.query.cargosServicios.findMany({
        where: (cargo, { eq, and, or }) => and(
          eq(cargo.fraccionamientoId, fraccionamiento.id),
          eq(cargo.estado, 'pagado'),
          or(...mesesLista.map(m => and(eq(cargo.mes, m.mes), eq(cargo.anio, m.anio)))),
        ),
        with: { perfil: { with: { usuario: true } }, fraccionamientoServicio: { with: { servicio: true } } },
      }),
      db.query.gastosFraccionamiento.findMany({
        where: (g, { eq, and, or }) => and(
          eq(g.fraccionamientoId, fraccionamiento.id),
          or(...mesesLista.map(m => and(eq(g.mes, m.mes), eq(g.anio, m.anio)))),
        ),
        orderBy: (g, { desc }) => [desc(g.anio), desc(g.mes), desc(g.fecha)],
      }),
      db.query.ingresosAdicionales.findMany({
        where: (i, { eq, and, or }) => and(
          eq(i.fraccionamientoId, fraccionamiento.id),
          or(...mesesLista.map(m => and(eq(i.mes, m.mes), eq(i.anio, m.anio)))),
        ),
        orderBy: (i, { desc }) => [desc(i.anio), desc(i.mes), desc(i.fecha)],
      }),
    ]);

    // Desglose por mes
    const porMes: MesResumen[] = mesesLista.map(({ mes, anio }) => {
      const pagosM   = pagosTodos.filter(p => p.mes === mes && p.anio === anio);
      const cargosM  = cargosServiciosTodos.filter(cargo => cargo.mes === mes && cargo.anio === anio && cargo.fraccionamientoServicio?.servicio?.clave !== 'agua');
      const gastosM  = gastosTodos.filter(g => g.mes === mes && g.anio === anio);
      const ingresosM = ingresosTodos.filter(i => i.mes === mes && i.anio === anio);
      const totalPagos               = pagosM.reduce((s, p) => s + montoDisponibleFraccionamiento(p), 0) + cargosM.reduce((s, cargo) => s + Number(cargo.monto), 0);
      const totalIngresosAdicionales = ingresosM.reduce((s, i) => s + Number(i.monto), 0);
      const totalRecaudado           = totalPagos + totalIngresosAdicionales;
      const totalGastos              = gastosM.reduce((s, g) => s + Number(g.monto), 0);
      return { mes, anio, totalPagos, totalIngresosAdicionales, totalRecaudado, totalGastos, saldo: totalRecaudado - totalGastos, cantidadPagos: pagosM.length + cargosM.length };
    });

    const totalPagos               = porMes.reduce((s, m) => s + m.totalPagos, 0);
    const totalIngresosAdicionales = porMes.reduce((s, m) => s + m.totalIngresosAdicionales, 0);
    const totalRecaudado           = totalPagos + totalIngresosAdicionales;
    const totalGastos              = porMes.reduce((s, m) => s + m.totalGastos, 0);
    const saldo                    = totalRecaudado - totalGastos;

    // Desglose por edificio (acumulado en el rango)
    const edificios   = [...new Set(residentes.map(r => r.edificio))].sort();
    const porEdificio = edificios.map(ed => {
      const resEd  = residentes.filter(r => r.edificio === ed);
      const pagEd  = pagosTodos.filter(p => p.perfil?.edificio === ed);
      const cargosEd = cargosServiciosTodos.filter(cargo => cargo.perfil?.edificio === ed && cargo.fraccionamientoServicio?.servicio?.clave !== 'agua');
      const pagIds = new Set([...pagEd.map(p => p.perfilId), ...cargosEd.map(cargo => cargo.perfilId)]);
      return {
        edificio:          ed,
        totalPagado:       pagEd.reduce((s, p) => s + montoDisponibleFraccionamiento(p), 0) + cargosEd.reduce((s, cargo) => s + Number(cargo.monto), 0),
        cantidadPagos:     pagEd.length + cargosEd.length,
        residentesActivos: resEd.filter(r => pagIds.has(r.id)).length,
        residentesMorosos: resEd.filter(r => !pagIds.has(r.id)).length,
      };
    });

    const gastosMapeados: GastoRangoReporte[] = gastosTodos.map(g => ({
      mes:       g.mes,
      anio:      g.anio,
      concepto:  g.concepto,
      monto:     g.monto,
      categoria: g.categoria,
      fecha:     g.fecha ?? new Date(),
    }));

    const ingresosMapeados: IngresoRangoReporte[] = ingresosTodos.map(i => ({
      mes:      i.mes,
      anio:     i.anio,
      concepto: i.concepto,
      monto:    i.monto,
      fecha:    i.fecha ?? new Date(),
    }));

    const { pagosReporte, totalesPorServicio } = mapearPagosReporte(
      fraccionamiento.nombre,
      pagosTodos,
      cargosServiciosTodos,
    );

    const xlsxBuffer = await generarReporteFinancieroRangoExcel({
      fraccionamiento: fraccionamiento.nombre,
      mesDesde, anioDesde, mesHasta, anioHasta,
      generadoEn:  new Date(),
      totalRecaudado, totalPagos, totalIngresosAdicionales, totalGastos, saldo,
      totalResidentes: residentes.length,
      porEdificio,
      gastos:   gastosMapeados,
      ingresos: ingresosMapeados,
      porMes,
      pagos:    pagosReporte,
      totalesPorServicio,
    });

    const label = desdeNum === hastaNum
      ? `${mesDesde}-${anioDesde}`
      : `${mesDesde}-${anioDesde}_a_${mesHasta}-${anioHasta}`;

    return new Response(new Uint8Array(xlsxBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-financiero-${label}.xlsx"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Total-Movimientos': String(pagosReporte.length),
        'X-Total-Pagos-Monto': String(totalPagos),
      },
    });
  }

  // Exportación de un solo mes.
  const mes  = parseInt(url.searchParams.get('mes')  ?? String(new Date().getMonth() + 1), 10);
  const anio = parseInt(url.searchParams.get('anio') ?? String(new Date().getFullYear()), 10);

  if (!isMesValido(mes) || !isAnioValido(anio)) return new Response('Parámetros inválidos', { status: 400 });

  const [residentes, pagosPeriodo, cargosServiciosPeriodo, gastosPeriodo, ingresosPeriodo] = await Promise.all([
    db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.fraccionamientoId, fraccionamiento.id),
    }),
    db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.fraccionamientoId, fraccionamiento.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      with: { perfil: { with: { usuario: true } } },
    }),
    db.query.cargosServicios.findMany({
      where: (cargo, { eq, and }) => and(eq(cargo.fraccionamientoId, fraccionamiento.id), eq(cargo.mes, mes), eq(cargo.anio, anio), eq(cargo.estado, 'pagado')),
      with: { perfil: { with: { usuario: true } }, fraccionamientoServicio: { with: { servicio: true } } },
    }),
    db.query.gastosFraccionamiento.findMany({
      where: (g, { eq, and }) => and(eq(g.fraccionamientoId, fraccionamiento.id), eq(g.mes, mes), eq(g.anio, anio)),
      orderBy: (g, { desc }) => [desc(g.fecha)],
    }),
    db.query.ingresosAdicionales.findMany({
      where: (i, { eq, and }) => and(eq(i.fraccionamientoId, fraccionamiento.id), eq(i.mes, mes), eq(i.anio, anio)),
      orderBy: (i, { desc }) => [desc(i.fecha)],
    }),
  ]);

  const cargosAdicionales = cargosServiciosPeriodo.filter((cargo) => cargo.fraccionamientoServicio?.servicio?.clave !== 'agua');
  const totalPagos               = pagosPeriodo.reduce((s, p) => s + montoDisponibleFraccionamiento(p), 0) + cargosAdicionales.reduce((s, cargo) => s + Number(cargo.monto), 0);
  const totalIngresosAdicionales = ingresosPeriodo.reduce((s, i) => s + Number(i.monto), 0);
  const totalRecaudado           = totalPagos + totalIngresosAdicionales;
  const totalGastos              = gastosPeriodo.reduce((s, g) => s + Number(g.monto), 0);
  const perfilesPagados = new Set([...pagosPeriodo.map((p) => p.perfilId), ...cargosAdicionales.map((cargo) => cargo.perfilId)]);
  const totalPagaron = perfilesPagados.size;
  const porcentajeCobranza = residentes.length > 0
    ? Math.round((totalPagaron / residentes.length) * 100 * 10) / 10
    : 0;

  const edificios = [...new Set(residentes.map(r => r.edificio))].sort();
  const porEdificio = edificios.map(ed => {
    const resEd  = residentes.filter(r => r.edificio === ed);
    const pagEd  = pagosPeriodo.filter(p => p.perfil?.edificio === ed);
    const cargosEd = cargosAdicionales.filter(cargo => cargo.perfil?.edificio === ed);
    const pagIds = new Set([...pagEd.map(p => p.perfilId), ...cargosEd.map(cargo => cargo.perfilId)]);
    return {
      edificio:          ed,
      totalPagado:       pagEd.reduce((s, p) => s + montoDisponibleFraccionamiento(p), 0) + cargosEd.reduce((s, cargo) => s + Number(cargo.monto), 0),
      cantidadPagos:     pagEd.length + cargosEd.length,
      residentesActivos: resEd.filter(r => pagIds.has(r.id)).length,
      residentesMorosos: resEd.filter(r => !pagIds.has(r.id)).length,
    };
  });

  const { pagosReporte, totalesPorServicio } = mapearPagosReporte(
    fraccionamiento.nombre,
    pagosPeriodo,
    cargosServiciosPeriodo,
  );

  const xlsxBuffer = await generarReporteFinancieroExcel({
    fraccionamiento:    fraccionamiento.nombre,
    mes, anio,
    generadoEn:         new Date(),
    totalRecaudado,
    totalPagos,
    totalIngresosAdicionales,
    totalResidentes:    residentes.length,
    totalPagaron,
    totalMorosos:       residentes.length - totalPagaron,
    porcentajeCobranza,
    saldo:              totalRecaudado - totalGastos,
    totalGastos,
    porEdificio,
    gastos:   gastosPeriodo.map(g => ({
      concepto:  g.concepto,
      monto:     g.monto,
      categoria: g.categoria,
      fecha:     g.fecha ?? new Date(),
    })),
    ingresos: ingresosPeriodo.map(i => ({
      concepto: i.concepto,
      monto:    i.monto,
      fecha:    i.fecha ?? new Date(),
    }) satisfies IngresoAdicionalReporte),
    pagos:    pagosReporte,
    totalesPorServicio,
  });

  return new Response(new Uint8Array(xlsxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-financiero-${mes}-${anio}.xlsx"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Total-Movimientos': String(pagosReporte.length),
      'X-Total-Pagos-Monto': String(totalPagos),
    },
  });
  } finally {
    await exportGuard.release();
  }
}
