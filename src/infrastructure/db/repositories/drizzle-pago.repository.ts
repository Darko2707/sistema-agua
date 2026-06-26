import { and, eq, inArray, lt, sql, gte } from 'drizzle-orm';
import { db } from '@/db';
import { pagos, cortes, tickets, perfilesResidente } from '@/db/schema';
import type {
  PagoRepository,
  PagoData,
  CrearPagoInput,
  CorteData,
  MetricasAdmin,
} from '@/src/application/ports/pago.repository';
import { TRPCError } from '@trpc/server';

function esViolacionUnicidad(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err &&
    (err as { code: string }).code === '23505';
}

export class DrizzlePagoRepository implements PagoRepository {
  async findByPerfilYMes(perfilId: string, mes: number, anio: number): Promise<PagoData | null> {
    const row = await db.query.pagos.findFirst({
      where: (p, { eq, and }) => and(eq(p.perfilId, perfilId), eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
    });
    return row as PagoData | null;
  }

  async findByPerfilId(perfilId: string, limit = 12): Promise<PagoData[]> {
    const rows = await db.query.pagos.findMany({
      where: (p, { eq }) => eq(p.perfilId, perfilId),
      orderBy: (p, { desc }) => [desc(p.anio), desc(p.mes)],
      limit,
    });
    return rows as PagoData[];
  }

  async findAllPagadosPorMes(mes: number, anio: number): Promise<PagoData[]> {
    const rows = await db.query.pagos.findMany({
      where: (p, { eq, and }) => and(eq(p.mes, mes), eq(p.anio, anio), eq(p.estado, 'pagado')),
      orderBy: (p, { desc }) => [desc(p.fechaPago)],
    });
    return rows as PagoData[];
  }

  async findPagadosByMes(mes: number, anio: number): Promise<Array<{ perfilId: string }>> {
    return db.select({ perfilId: pagos.perfilId })
      .from(pagos)
      .where(and(eq(pagos.mes, mes), eq(pagos.anio, anio), eq(pagos.estado, 'pagado')));
  }

  async createWithLock(perfilId: string, input: CrearPagoInput): Promise<PagoData> {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM perfiles_residente WHERE id = ${perfilId} FOR UPDATE`);

        const yaPago = await tx.query.pagos.findFirst({
          where: (p, { eq, and }) =>
            and(eq(p.perfilId, perfilId), eq(p.mes, input.mes), eq(p.anio, input.anio), eq(p.estado, 'pagado')),
        });
        if (yaPago) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya existe un pago registrado para este mes' });
        }

        const [pago] = await tx.insert(pagos).values(input).returning();

        // Actualizar estado del perfil según tipo de pago
        const perfil = await tx.query.perfilesResidente.findFirst({
          where: (p, { eq }) => eq(p.id, perfilId),
        });
        if (perfil?.estadoAgua === 'pendiente_corte' && !input.esReconexion) {
          await tx.update(perfilesResidente).set({ estadoAgua: 'activo' }).where(eq(perfilesResidente.id, perfilId));
        } else if (perfil?.estadoAgua === 'cortado' && input.esReconexion) {
          // Transición a pendiente_reconexion: el pago cubre mes + reconexión.
          // El corte físico permanece abierto hasta que la cuadrilla confirme la reconexión.
          await tx.update(perfilesResidente).set({ estadoAgua: 'pendiente_reconexion' }).where(eq(perfilesResidente.id, perfilId));
        }

        await tx.insert(tickets).values({ pagoId: pago.id, folio: input.folio, pdfUrl: null });

        return pago;
      });
      return result as PagoData;
    } catch (txError) {
      if (txError instanceof TRPCError) throw txError;
      if (esViolacionUnicidad(txError)) {
        const ganador = await db.query.pagos.findFirst({
          where: (p, { eq, and }) =>
            and(eq(p.perfilId, perfilId), eq(p.mes, input.mes), eq(p.anio, input.anio), eq(p.estado, 'pagado')),
        });
        if (ganador) return ganador as PagoData;
      }
      throw txError;
    }
  }

  async findCorteActivo(perfilId: string): Promise<CorteData | null> {
    const row = await db.query.cortes.findFirst({
      where: (c, { eq, and }) => and(eq(c.perfilId, perfilId), eq(c.activo, true)),
    });
    return row as CorteData | null;
  }

  async crearCorte(data: { perfilId: string; trabajadorId: string; motivo: string }): Promise<CorteData> {
    const [row] = await db.insert(cortes).values({ ...data, activo: true }).returning();
    return row as CorteData;
  }

  async cerrarCorte(corteId: string, fecha: Date, reconectadoPor?: string): Promise<void> {
    await db.update(cortes)
      .set({ activo: false, fechaReconexion: fecha, reconectadoPor })
      .where(eq(cortes.id, corteId));
  }

  async crearTicket(pagoId: string, folio: string): Promise<void> {
    await db.insert(tickets).values({ pagoId, folio, pdfUrl: null });
  }

  async marcarPendientesVencidos(antes: Date): Promise<number> {
    const result = await db
      .update(pagos)
      .set({ estado: 'vencido' })
      .where(and(eq(pagos.estado, 'pendiente'), lt(pagos.creadoEn, antes)));
    return result.rowCount ?? 0;
  }

  async getMetricasAdmin(mes: number, anio: number): Promise<MetricasAdmin> {
    // Pagos por día — last 30 days, regardless of month filter
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 29);
    hace30.setHours(0, 0, 0, 0);

    const porDiaRows = await db
      .select({
        fecha: sql<string>`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`,
        cantidad: sql<number>`count(*)::int`,
        monto: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
      })
      .from(pagos)
      .where(and(eq(pagos.estado, 'pagado'), gte(pagos.fechaPago, hace30)))
      .groupBy(sql`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${pagos.fechaPago}, 'YYYY-MM-DD')`);

    // Revenue and counts for the given month
    const [mesRow] = await db
      .select({
        revenue: sql<number>`coalesce(sum(${pagos.montoBase}::numeric), 0)::float`,
        pagados: sql<number>`count(*)::int`,
        reconexiones: sql<number>`count(*) filter (where ${pagos.esReconexion} = true)::int`,
      })
      .from(pagos)
      .where(and(eq(pagos.estado, 'pagado'), eq(pagos.mes, mes), eq(pagos.anio, anio)));

    const [totalRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(perfilesResidente);

    const totalResidentes = totalRow?.total ?? 0;
    const totalPagadosMes = mesRow?.pagados ?? 0;
    const morosidadPct = totalResidentes > 0
      ? Math.round(((totalResidentes - totalPagadosMes) / totalResidentes) * 100)
      : 0;

    return {
      pagosPorDia:    porDiaRows.map(r => ({ fecha: r.fecha, cantidad: r.cantidad, monto: r.monto })),
      revenueMes:     mesRow?.revenue ?? 0,
      totalPagadosMes,
      totalResidentes,
      morosidadPct,
      reconexionesMes: mesRow?.reconexiones ?? 0,
    };
  }
}
