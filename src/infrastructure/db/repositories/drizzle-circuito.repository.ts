import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { decryptTokenSafe } from '@/lib/crypto';
import type { CircuitoRepository, CircuitoData } from '@/src/application/ports/circuito.repository';

function toData(row: typeof circuitos.$inferSelect): CircuitoData {
  return {
    id:                     row.id,
    nombre:                 row.nombre,
    representanteId:        row.representanteId ?? null,
    montoMensual:           row.montoMensual,
    montoReconexion:        row.montoReconexion,
    // Descifrar el token al leer — soporta valores cifrados y texto plano
    // (compatibilidad hacia atrás durante la migración)
    mercadoPagoAccessToken: decryptTokenSafe(row.mercadoPagoAccessToken),
    mercadoPagoCollectorId: row.mercadoPagoCollectorId ?? null,
    activo:                 row.activo,
  };
}

export class DrizzleCircuitoRepository implements CircuitoRepository {
  async findById(id: string): Promise<CircuitoData | null> {
    const row = await db.query.circuitos.findFirst({ where: (c, { eq }) => eq(c.id, id) });
    return row ? toData(row) : null;
  }

  async findByRepresentante(representanteId: string): Promise<CircuitoData | null> {
    const row = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.representanteId, representanteId),
    });
    return row ? toData(row) : null;
  }

  async findAll(): Promise<CircuitoData[]> {
    const rows = await db.query.circuitos.findMany({ orderBy: (c, { asc }) => [asc(c.nombre)] });
    return rows.map(toData);
  }

  async updateActivo(id: string, activo: boolean): Promise<void> {
    await db.update(circuitos).set({ activo }).where(eq(circuitos.id, id));
  }

  async updateMontos(id: string, montoMensual: string, montoReconexion: string): Promise<void> {
    await db.update(circuitos).set({ montoMensual, montoReconexion }).where(eq(circuitos.id, id));
  }

  async updateRepresentante(id: string, representanteId: string | null): Promise<void> {
    await db.update(circuitos).set({ representanteId }).where(eq(circuitos.id, id));
  }
}
