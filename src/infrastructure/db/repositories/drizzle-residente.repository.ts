import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { perfilesResidente } from '@/db/schema';
import type { EstadoAgua } from '@/src/domain/agua/state-machine';
import type {
  ResidenteRepository,
  ResidenteData,
  ResidenteConRelaciones,
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
      userId:       data.userId,
      circuitoId:   data.circuitoId,
      edificio:     data.edificio,
      departamento: data.departamento,
      estadoAgua:   data.estadoAgua,
      // telefono, sexo, tenencia provided via spread from handler callers that cast properly
    } as typeof perfilesResidente.$inferInsert).returning();
    return toData(row);
  }

  async updateEstado(id: string, estadoAgua: EstadoAgua): Promise<void> {
    await db.update(perfilesResidente)
      .set({ estadoAgua })
      .where(eq(perfilesResidente.id, id));
  }
}
