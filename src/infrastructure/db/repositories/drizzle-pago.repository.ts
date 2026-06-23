import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { pagos, cortes, tickets, perfilesResidente } from '@/db/schema';
import type {
  PagoRepository,
  PagoData,
  CrearPagoInput,
  CorteData,
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

  async findByCircuitoYMes(circuitoId: string, mes: number, anio: number): Promise<PagoData[]> {
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
}
