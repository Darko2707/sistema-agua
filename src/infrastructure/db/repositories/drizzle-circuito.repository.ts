import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { circuitos, fraccionamientoMetodosPago } from '@/db/schema';
import type { CircuitoRepository, CircuitoData, MpFields } from '@/src/application/ports/circuito.repository';

function toData(row: typeof circuitos.$inferSelect): CircuitoData {
  return {
    id:                     row.id,
    nombre:                 row.nombre,
    fraccionamientoId:      row.fraccionamientoId ?? null,
    representanteId:        row.representanteId ?? null,
    tesoreraId:             row.tesoreraId ?? null,
    montoMensual:           row.montoMensual,
    montoReconexion:        row.montoReconexion,
    // Descifrar el token al leer — soporta valores cifrados y texto plano
    // (compatibilidad hacia atrás durante la migración)
    mercadoPagoAccessToken: null,
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
      fraccionamientoId: circuitos.fraccionamientoId,
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
    await db.transaction(async (tx) => {
      const [circuito] = await tx.select({ fraccionamientoId: circuitos.fraccionamientoId })
        .from(circuitos).where(eq(circuitos.id, id)).limit(1);
      if (!circuito?.fraccionamientoId) throw new Error('El circuito no tiene fraccionamiento asignado');
      await tx.update(circuitos).set({ representanteId }).where(eq(circuitos.id, id));
      if (mp.encryptedAccessToken || mp.collectorId) {
        await tx.insert(fraccionamientoMetodosPago).values({
          fraccionamientoId: circuito.fraccionamientoId,
          accessTokenCifrado: mp.encryptedAccessToken ?? '',
          collectorId: mp.collectorId ?? null,
        }).onConflictDoUpdate({
          target: [fraccionamientoMetodosPago.fraccionamientoId, fraccionamientoMetodosPago.proveedor],
          set: {
            ...(mp.encryptedAccessToken ? { accessTokenCifrado: mp.encryptedAccessToken } : {}),
            ...(mp.collectorId ? { collectorId: mp.collectorId } : {}),
            actualizadoEn: new Date(),
          },
        });
      }
    });
  }

  async updateTesoreraWithMp(id: string, tesoreraId: string, mp: MpFields): Promise<void> {
    await db.transaction(async (tx) => {
      const [circuito] = await tx.select({ fraccionamientoId: circuitos.fraccionamientoId })
        .from(circuitos).where(eq(circuitos.id, id)).limit(1);
      if (!circuito?.fraccionamientoId) throw new Error('El circuito no tiene fraccionamiento asignado');
      await tx.update(circuitos).set({ tesoreraId }).where(eq(circuitos.id, id));
      if (mp.encryptedAccessToken || mp.collectorId) {
        await tx.insert(fraccionamientoMetodosPago).values({
          fraccionamientoId: circuito.fraccionamientoId,
          accessTokenCifrado: mp.encryptedAccessToken ?? '',
          collectorId: mp.collectorId ?? null,
        }).onConflictDoUpdate({
          target: [fraccionamientoMetodosPago.fraccionamientoId, fraccionamientoMetodosPago.proveedor],
          set: {
            ...(mp.encryptedAccessToken ? { accessTokenCifrado: mp.encryptedAccessToken } : {}),
            ...(mp.collectorId ? { collectorId: mp.collectorId } : {}),
            actualizadoEn: new Date(),
          },
        });
      }
    });
  }

  async clearRepresentanteByUserId(userId: string): Promise<void> {
    await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.representanteId, userId));
  }

  async clearTesoreraByUserId(userId: string): Promise<void> {
    await db.update(circuitos).set({ tesoreraId: null }).where(eq(circuitos.tesoreraId, userId));
  }
}
