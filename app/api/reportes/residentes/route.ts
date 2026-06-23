import { auth } from '@/lib/auth';
import { db } from '@/db';
import { generarReporteResidentesExcel } from '@/server/services/excel-reportes';

function parsarDepto(depto: string) {
  const m = depto.match(/^(\d+)([a-zA-Z]?)$/);
  if (m) return { numero: parseInt(m[1], 10), letra: m[2].toLowerCase() };
  return { numero: 0, letra: depto.toLowerCase() };
}

function sortPorEdificio<T extends { edificio: string; departamento: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ea = parseInt(a.edificio, 10), eb = parseInt(b.edificio, 10);
    const edifCmp = isNaN(ea) || isNaN(eb) ? a.edificio.localeCompare(b.edificio) : ea - eb;
    if (edifCmp !== 0) return edifCmp;
    const da = parsarDepto(a.departamento), db2 = parsarDepto(b.departamento);
    if (da.letra !== db2.letra) return da.letra.localeCompare(db2.letra);
    return da.numero - db2.numero;
  });
}

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  const dbUser = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  if (dbUser?.role !== 'representante') return new Response('Prohibido', { status: 403 });

  const circuito = await db.query.circuitos.findFirst({
    where: (c, { eq }) => eq(c.representanteId, session.user.id),
  });
  if (!circuito) return new Response('Sin circuito asignado', { status: 404 });

  const url    = new URL(req.url);
  const orden  = (url.searchParams.get('orden') ?? 'edificio') as 'edificio' | 'nombre' | 'estado';
  const estadoFiltro   = url.searchParams.get('estadoAgua') as 'activo' | 'pendiente_corte' | 'cortado' | 'pendiente_reconexion' | null;
  const edificioFiltro = url.searchParams.get('edificio') ?? undefined;

  const residentes = await db.query.perfilesResidente.findMany({
    where: (p, { eq, and }) => {
      const conds = [eq(p.circuitoId, circuito.id)];
      if (estadoFiltro)   conds.push(eq(p.estadoAgua, estadoFiltro));
      if (edificioFiltro) conds.push(eq(p.edificio, edificioFiltro));
      return and(...conds as [ReturnType<typeof eq>]);
    },
    with: { usuario: true },
  });

  // Últimos 12 meses
  const hoy = new Date();
  const periodos: { mes: number; anio: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    periodos.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
  }

  const perfilIds = residentes.map(r => r.id);
  const pagosList = perfilIds.length > 0
    ? await db.query.pagos.findMany({
        where: (p, { inArray }) => inArray(p.perfilId, perfilIds),
        columns: { id: true, perfilId: true, mes: true, anio: true, monto: true, estado: true, fechaPago: true },
      })
    : [];

  const residentesData = residentes.map(r => {
    const pagosR = pagosList.filter(p => p.perfilId === r.id);
    const pagosAnio = periodos.map(({ mes, anio }) => {
      const p = pagosR.find(p => p.mes === mes && p.anio === anio && p.estado === 'pagado');
      return { mes, anio, monto: p ? Number(p.monto) : null, estado: p ? 'pagado' as const : 'pendiente' as const };
    });
    const totalPagado   = pagosAnio.reduce((s, p) => s + (p.monto ?? 0), 0);
    const mesesSinPagar = pagosAnio.filter(p => p.estado === 'pendiente').length;
    const ultimoPago    = pagosR
      .filter(p => p.estado === 'pagado' && p.fechaPago)
      .sort((a, b) => new Date(b.fechaPago!).getTime() - new Date(a.fechaPago!).getTime())[0]?.fechaPago ?? null;
    return {
      nombre:       r.usuario.name,
      telefono:     r.telefono,
      edificio:     r.edificio,
      departamento: r.departamento,
      estadoAgua:   r.estadoAgua,
      pagosAnio,
      totalPagado,
      mesesSinPagar,
      ultimoPago,
    };
  });

  let ordenados = residentesData;
  if (orden === 'nombre') {
    ordenados = [...residentesData].sort((a, b) => a.nombre.localeCompare(b.nombre));
  } else if (orden === 'estado') {
    const pr: Record<string, number> = { activo: 0, pendiente_corte: 1, pendiente_reconexion: 2, cortado: 3 };
    ordenados = [...residentesData].sort((a, b) => (pr[a.estadoAgua] ?? 4) - (pr[b.estadoAgua] ?? 4));
  } else {
    ordenados = sortPorEdificio(residentesData);
  }

  const xlsxBuffer = await generarReporteResidentesExcel({
    circuito:   circuito.nombre,
    generadoEn: new Date(),
    residentes: ordenados,
  });

  const nombre = circuito.nombre.replace(/\s+/g, '-');
  return new Response(new Uint8Array(xlsxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-residentes-${nombre}.xlsx"`,
    },
  });
}
