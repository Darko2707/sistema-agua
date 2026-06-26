import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { circuitos } from '@/db/schema';
import { decryptTokenSafe } from '@/lib/crypto';
import type { CircuitoRepository, CircuitoData, MpFields } from '@/src/application/ports/circuito.repository';

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

  async findByTesorera(tesoreraId: string): Promise<CircuitoData | null> {
    const row = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.tesoreraId, tesoreraId),
    });
    return row ? toData(row) : null;
  }

  async findActivos() {
    return db.select({
      id:              circuitos.id,
      nombre:          circuitos.nombre,
      activo:          circuitos.activo,
      representanteId: circuitos.representanteId,
    }).from(circuitos).where(eq(circuitos.activo, true));
  }

  async updateRepresentante(id: string, representanteId: string | null): Promise<void> {
    await db.update(circuitos).set({ representanteId }).where(eq(circuitos.id, id));
  }

  async updateTesorera(id: string, tesoreraId: string | null): Promise<void> {
    await db.update(circuitos).set({ tesoreraId }).where(eq(circuitos.id, id));
  }

  async updateRepresentanteWithMp(id: string, representanteId: string, mp: MpFields): Promise<void> {
    await db.update(circuitos).set({
      representanteId,
      ...(mp.encryptedAccessToken ? { mercadoPagoAccessToken: mp.encryptedAccessToken } : {}),
      ...(mp.collectorId          ? { mercadoPagoCollectorId: mp.collectorId }          : {}),
    }).where(eq(circuitos.id, id));
  }

  async updateTesoreraWithMp(id: string, tesoreraId: string, mp: MpFields): Promise<void> {
    await db.update(circuitos).set({
      tesoreraId,
      ...(mp.encryptedAccessToken ? { mercadoPagoAccessToken: mp.encryptedAccessToken } : {}),
      ...(mp.collectorId          ? { mercadoPagoCollectorId: mp.collectorId }          : {}),
    }).where(eq(circuitos.id, id));
  }

  async clearRepresentanteByUserId(userId: string): Promise<void> {
    await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, userId));
  }

  async clearTesoreraByUserId(userId: string): Promise<void> {
    await db.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, userId));
  }
}
