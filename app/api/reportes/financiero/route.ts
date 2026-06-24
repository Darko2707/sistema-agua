import { auth } from '@/lib/auth';
import { db } from '@/db';
import { generarReporteFinancieroExcel } from '@/server/services/excel-reportes';
import type { IngresoAdicionalReporte } from '@/server/services/excel-reportes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  const dbUser = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  if (dbUser?.role !== 'tesorera') return new Response('Prohibido', { status: 403 });

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.tesoreraId, session.user.id),
  });
  if (!circuito) return new Response('Sin circuito asignado', { status: 404 });

  const url  = new URL(req.url);
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
    mes,
    anio,
    generadoEn:         new Date(),
    totalRecaudado,
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
