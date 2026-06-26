import { and, count, eq, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { perfilesResidente, pagos } from '@/db/schema';
import type { EstadoAgua } from '@/src/domain/agua/state-machine';
import type {
  ResidenteRepository,
  ResidenteData,
  ResidenteConRelaciones,
  PaginatedResult,
  CircuitoRef,
} from '@/src/application/ports/residente.repository';

type WithRelaciones = typeof perfilesResidente.$inferSelect & {
  usuario?: { id: string; name: string; email: string; role: string } | null;
  circuito?: CircuitoRef | null;
  pagos?: { mes: number; anio: number; estado: string | null }[];
  cortes?: { activo: boolean | null }[];
};

function toData(row: typeof perfilesResidente.$inferSelect): ResidenteData {
  return {
    id:                  row.id,
    userId:              row.userId,
    circuitoId:          row.circuitoId,
    edificio:            row.edificio,
    departamento:        row.departamento,
    estadoAgua:          row.estadoAgua as EstadoAgua,
    telefono:            row.telefono ?? null,
    sexo:                row.sexo ?? null,
    tenencia:            row.tenencia ?? null,
    nombrePropietario:   row.nombrePropietario ?? null,
    telefonoPropietario: row.telefonoPropietario ?? null,
    creadoEn:            row.creadoEn ?? null,
  };
}

function toConRelaciones(row: WithRelaciones): ResidenteConRelaciones {
  return {
    ...toData(row),
    usuario: row.usuario ?? null,
    circuito: row.circuito ?? null,
    pagos:    row.pagos ?? [],
    cortes:   row.cortes ?? [],
  };
}

export class DrizzleResidenteRepository implements ResidenteRepository {
  async findById(id: string) {
    const row = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.id, id),
    });
    return row ? toData(row) : null;
  }

  async findByUserId(userId: string) {
    const row = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      with: { circuito: true },
    });
    if (!row) return null;
    return { ...toData(row), circuito: row.circuito ?? null };
  }

  async findByCircuito(circuitoId: string): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.circuitoId, circuitoId),
      with: { usuario: true, circuito: true, pagos: true, cortes: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findAll(): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      with: { usuario: true, circuito: true, pagos: true, cortes: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findAllPaginated(page: number, pageSize: number): Promise<PaginatedResult<ResidenteConRelaciones>> {
    const offset = (page - 1) * pageSize;
    const [rows, [{ total }]] = await Promise.all([
      db.query.perfilesResidente.findMany({
        with: { usuario: true, circuito: true, pagos: true, cortes: true },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
        limit: pageSize,
        offset,
      }),
      db.select({ total: count() }).from(perfilesResidente),
    ]);
    return {
      items:      rows.map(r => toConRelaciones(r as WithRelaciones)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findByCircuitoPaginated(circuitoId: string, page: number, pageSize: number): Promise<PaginatedResult<ResidenteConRelaciones>> {
    const offset = (page - 1) * pageSize;
    const [rows, [{ total }]] = await Promise.all([
      db.query.perfilesResidente.findMany({
        where: (p, { eq }) => eq(p.circuitoId, circuitoId),
        with: { usuario: true, circuito: true, pagos: true, cortes: true },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
        limit: pageSize,
        offset,
      }),
      db.select({ total: count() }).from(perfilesResidente)
        .where(eq(perfilesResidente.circuitoId, circuitoId)),
    ]);
    return {
      items:      rows.map(r => toConRelaciones(r as WithRelaciones)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findByEstado(estado: EstadoAgua): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.estadoAgua, estado),
      with: { usuario: true, circuito: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findByCircuitoYEstado(circuitoId: string, estado: EstadoAgua): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      where: (p, { eq, and }) => and(eq(p.circuitoId, circuitoId), eq(p.estadoAgua, estado)),
      with: { usuario: true, circuito: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async create(data: Omit<ResidenteData, 'id' | 'creadoEn'>): Promise<ResidenteData> {
    const [row] = await db.insert(perfilesResidente).values({
      userId:              data.userId,
      circuitoId:          data.circuitoId,
      edificio:            data.edificio,
      departamento:        data.departamento,
      estadoAgua:          data.estadoAgua,
      telefono:            data.telefono ?? null,
      sexo:                data.sexo ?? null,
      tenencia:            data.tenencia ?? null,
      nombrePropietario:   data.nombrePropietario ?? null,
      telefonoPropietario: data.telefonoPropietario ?? null,
    } as typeof perfilesResidente.$inferInsert).returning();
    return toData(row);
  }

  async updateEstado(id: string, estadoAgua: EstadoAgua): Promise<void> {
    await db.update(perfilesResidente)
      .set({ estadoAgua })
      .where(eq(perfilesResidente.id, id));
  }

  async marcarMorososDelMes(mes: number, anio: number): Promise<number> {
    const pagadosSubquery = db
      .select({ perfilId: pagos.perfilId })
      .from(pagos)
      .where(and(eq(pagos.mes, mes), eq(pagos.anio, anio), eq(pagos.estado, 'pagado')));

    const actualizados = await db
      .update(perfilesResidente)
      .set({ estadoAgua: 'pendiente_corte' })
      .where(and(
        eq(perfilesResidente.estadoAgua, 'activo'),
        notInArray(perfilesResidente.id, pagadosSubquery),
      ))
      .returning({ id: perfilesResidente.id });

    return actualizados.length;
  }
}
