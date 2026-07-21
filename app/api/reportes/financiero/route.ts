import { auth } from '@/lib/auth';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { circuitos } from '@/db/schema';
import {
  generarReporteFinancieroExcel,
  generarReporteFinancieroRangoExcel,
} from '@/server/services/excel-reportes';
import type {
  IngresoAdicionalReporte,
  GastoRangoReporte,
  IngresoRangoReporte,
  MesResumen,
} from '@/server/services/excel-reportes';

export const dynamic = 'force-dynamic';

// Genera lista de (mes, anio) entre dos períodos inclusive
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

async function resolverCircuito(userId: string) {
  let circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.tesoreraId, userId),
  });
  if (!circuito) {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
    });
    if (perfil?.circuitoId) {
      circuito = await db.query.circuitos.findFirst({
        where: (c, { eq }) => eq(c.id, perfil.circuitoId!),
      });
      if (circuito) {
        await db.update(circuitos).set({ tesoreraId: userId }).where(eq(circuitos.id, circuito.id));
      }
    }
  }
  return circuito ?? null;
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  const dbUser = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  if (dbUser?.role !== 'tesorera') return new Response('Prohibido', { status: 403 });

  const circuito = await resolverCircuito(session.user.id);
  if (!circuito) return new Response('Sin circuito asignado', { status: 404 });

  const url      = new URL(req.url);
  const mesDesdeRaw  = url.searchParams.get('mesDesde');
  const anioDesdeRaw = url.searchParams.get('anioDesde');
  const mesHastaRaw  = url.searchParams.get('mesHasta');
  const anioHastaRaw = url.searchParams.get('anioHasta');

  // ── Rango de meses ────────────────────────────────────────────────────────
  if (mesDesdeRaw && anioDesdeRaw && mesHastaRaw && anioHastaRaw) {
    const mesDesde  = parseInt(mesDesdeRaw,  10);
    const anioDesde = parseInt(anioDesdeRaw, 10);
    const mesHasta  = parseInt(mesHastaRaw,  10);
    const anioHasta = parseInt(anioHastaRaw, 10);

    if ([mesDesde, anioDesde, mesHasta, anioHasta].some(isNaN))
      return new Response('Parámetros inválidos', { status: 400 });

    const desdeNum = anioDesde * 100 + mesDesde;
    const hastaNum = anioHasta * 100 + mesHasta;
    if (hastaNum < desdeNum)
      return new Response('El rango de fechas es inválido', { status: 400 });

    const mesesLista = getMesesEnRango(mesDesde, anioDesde, mesHasta, anioHasta);

    const [residentes, pagosTodos, gastosTodos, ingresosTodos] = await Promise.all([
      db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.circuitoId, circuito.id),
      }),
      db.query.pagos.findMany({
        where: (p, { eq, and, or }) => and(
          eq(p.circuitoId, circuito.id),
          eq(p.estado, 'pagado'),
          or(...mesesLista.map(m => and(eq(p.mes, m.mes), eq(p.anio, m.anio)))),
        ),
        with: { perfil: true },
      }),
      db.query.gastosCircuito.findMany({
        where: (g, { eq, and, or }) => and(
          eq(g.circuitoId, circuito.id),
          or(...mesesLista.map(m => and(eq(g.mes, m.mes), eq(g.anio, m.anio)))),
        ),
        orderBy: (g, { asc }) => [asc(g.anio), asc(g.mes), asc(g.fecha)],
      }),
      db.query.ingresosAdicionales.findMany({
        where: (i, { eq, and, or }) => and(
          eq(i.circuitoId, circuito.id),
          or(...mesesLista.map(m => and(eq(i.mes, m.mes), eq(i.anio, m.anio)))),
        ),
        orderBy: (i, { asc }) => [asc(i.anio), asc(i.mes), asc(i.fecha)],
      }),
    ]);

    // Desglose por mes
    const porMes: MesResumen[] = mesesLista.map(({ mes, anio }) => {
      const pagosM   = pagosTodos.filter(p => p.mes === mes && p.anio === anio);
      const gastosM  = gastosTodos.filter(g => g.mes === mes && g.anio === anio);
      const ingresosM = ingresosTodos.filter(i => i.mes === mes && i.anio === anio);
      const totalPagos               = pagosM.reduce((s, p) => s + Number(p.monto), 0);
      const totalIngresosAdicionales = ingresosM.reduce((s, i) => s + Number(i.monto), 0);
      const totalRecaudado           = totalPagos + totalIngresosAdicionales;
      const totalGastos              = gastosM.reduce((s, g) => s + Number(g.monto), 0);
      return { mes, anio, totalPagos, totalIngresosAdicionales, totalRecaudado, totalGastos, saldo: totalRecaudado - totalGastos, cantidadPagos: pagosM.length };
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
      const pagIds = new Set(pagEd.map(p => p.perfilId));
      return {
        edificio:          ed,
        totalPagado:       pagEd.reduce((s, p) => s + Number(p.monto), 0),
        cantidadPagos:     pagEd.length,
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

    const xlsxBuffer = await generarReporteFinancieroRangoExcel({
      circuito:    circuito.nombre,
      mesDesde, anioDesde, mesHasta, anioHasta,
      generadoEn:  new Date(),
      totalRecaudado, totalPagos, totalIngresosAdicionales, totalGastos, saldo,
      totalResidentes: residentes.length,
      porEdificio,
      gastos:   gastosMapeados,
      ingresos: ingresosMapeados,
      porMes,
    });

    const label = desdeNum === hastaNum
      ? `${mesDesde}-${anioDesde}`
      : `${mesDesde}-${anioDesde}_a_${mesHasta}-${anioHasta}`;

    return new Response(new Uint8Array(xlsxBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-financiero-${label}.xlsx"`,
      },
    });
  }

  // ── Un solo mes (comportamiento anterior) ─────────────────────────────────
  const mes  = parseInt(url.searchParams.get('mes')  ?? String(new Date().getMonth() + 1), 10);
  const anio = parseInt(url.searchParams.get('anio') ?? String(new Date().getFullYear()), 10);

  if (isNaN(mes) || isNaN(anio)) return new Response('Parámetros inválidos', { status: 400 });

  const [residentes, pagosPeriodo, gastosPeriodo, ingresosPeriodo] = await Promise.all([
    db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.circuitoId, circuito.id),
    }),
    db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.circuitoId, circuito.id), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      with: { perfil: true },
    }),
    db.query.gastosCircuito.findMany({
      where: (g, { eq, and }) => and(eq(g.circuitoId, circuito.id), eq(g.mes, mes), eq(g.anio, anio)),
      orderBy: (g, { asc }) => [asc(g.fecha)],
    }),
    db.query.ingresosAdicionales.findMany({
      where: (i, { eq, and }) => and(eq(i.circuitoId, circuito.id), eq(i.mes, mes), eq(i.anio, anio)),
      orderBy: (i, { asc }) => [asc(i.fecha)],
    }),
  ]);

  const totalPagos               = pagosPeriodo.reduce((s, p) => s + Number(p.monto), 0);
  const totalIngresosAdicionales = ingresosPeriodo.reduce((s, i) => s + Number(i.monto), 0);
  const totalRecaudado           = totalPagos + totalIngresosAdicionales;
  const totalGastos              = gastosPeriodo.reduce((s, g) => s + Number(g.monto), 0);
  const montoMensual   = Number(circuito.montoMensual);
  const totalEsperado  = residentes.length * montoMensual;
  const porcentajeCobranza = totalEsperado > 0
    ? Math.round((totalRecaudado / totalEsperado) * 100 * 10) / 10
    : 0;

  const edificios = [...new Set(residentes.map(r => r.edificio))].sort();
  const porEdificio = edificios.map(ed => {
    const resEd  = residentes.filter(r => r.edificio === ed);
    const pagEd  = pagosPeriodo.filter(p => p.perfil?.edificio === ed);
    const pagIds = new Set(pagEd.map(p => p.perfilId));
    return {
      edificio:          ed,
      totalPagado:       pagEd.reduce((s, p) => s + Number(p.monto), 0),
      cantidadPagos:     pagEd.length,
      residentesActivos: resEd.filter(r => pagIds.has(r.id)).length,
      residentesMorosos: resEd.filter(r => !pagIds.has(r.id)).length,
    };
  });

  const xlsxBuffer = await generarReporteFinancieroExcel({
    circuito:           circuito.nombre,
    mes, anio,
    generadoEn:         new Date(),
    totalRecaudado,
    totalPagos,
    totalIngresosAdicionales,
    totalResidentes:    residentes.length,
    totalPagaron:       pagosPeriodo.length,
    totalMorosos:       residentes.length - pagosPeriodo.length,
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
  });

  return new Response(new Uint8Array(xlsxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-financiero-${mes}-${anio}.xlsx"`,
    },
  });
}
