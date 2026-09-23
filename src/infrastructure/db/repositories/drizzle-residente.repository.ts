import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { circuitos, fraccionamientoMetodosPago, fraccionamientoServicios, perfilesResidente, perfilesServicios, servicios, user } from '@/db/schema';
import type { EstadoAgua } from '@/src/domain/agua/state-machine';
import type {
  ResidenteRepository,
  ResidenteData,
  ResidenteConRelaciones,
  PaginatedResult,
  CircuitoRef,
  CircuitoPaymentConfigRef,
  ServicioCobroRef,
} from '@/src/application/ports/residente.repository';

const circuitoSafeColumns = {
  id: true,
  nombre: true,
  montoMensual: true,
  montoReconexion: true,
  representanteId: true,
  activo: true,
} as const;

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
    fraccionamientoId:   row.fraccionamientoId ?? null,
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
      with: { circuito: { columns: circuitoSafeColumns } },
    });
    if (!row) return null;
    return { ...toData(row), circuito: row.circuito ?? null };
  }

  async findWaterServiceConfig(perfilId: string): Promise<ServicioCobroRef | null> {
    const [row] = await db.select({
      montoMensual: fraccionamientoServicios.montoMensual,
      montoReconexion: fraccionamientoServicios.montoReconexion,
      conCorteFisico: servicios.conCorteFisico,
    }).from(perfilesServicios)
      .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, perfilesServicios.fraccionamientoServicioId))
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(and(
        eq(perfilesServicios.perfilId, perfilId),
        eq(perfilesServicios.activo, true),
        eq(servicios.clave, 'agua'),
        eq(fraccionamientoServicios.estado, 'activo'),
      ))
      .limit(1);
    return row ?? null;
  }

  async findByUserIdWithPaymentConfig(userId: string): Promise<(
    ResidenteData & { circuito?: CircuitoPaymentConfigRef | null }
  ) | null> {
    const row = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.userId, userId),
      with: { circuito: true },
    });
    if (!row) return null;
    if (!row.circuito) return { ...toData(row), circuito: null };

    // Mercado Pago ahora pertenece al fraccionamiento. El fallback legacy se
    // mantiene solo durante la ventana de migración 0024.
    const [tenantPaymentConfig] = await db
      .select({ accessToken: fraccionamientoMetodosPago.accessTokenCifrado, collectorId: fraccionamientoMetodosPago.collectorId })
      .from(fraccionamientoMetodosPago)
      .where(and(
        eq(fraccionamientoMetodosPago.fraccionamientoId, row.fraccionamientoId!),
        eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
        eq(fraccionamientoMetodosPago.activo, true),
      ))
      .limit(1);

    return {
      ...toData(row),
      circuito: {
        ...row.circuito,
        mercadoPagoAccessToken: tenantPaymentConfig?.accessToken ?? row.circuito.mercadoPagoAccessToken,
        mercadoPagoCollectorId: tenantPaymentConfig?.collectorId ?? row.circuito.mercadoPagoCollectorId,
      },
    };
  }

  async findByCircuito(circuitoId: string): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      where: (p, { eq }) => eq(p.circuitoId, circuitoId),
      with: { usuario: true, circuito: { columns: circuitoSafeColumns }, pagos: true, cortes: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findAll(): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      with: { usuario: true, circuito: { columns: circuitoSafeColumns }, pagos: true, cortes: true },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findAllPaginated(page: number, pageSize: number): Promise<PaginatedResult<ResidenteConRelaciones>> {
    const offset = (page - 1) * pageSize;
    const [rows, [{ total }]] = await Promise.all([
      db.query.perfilesResidente.findMany({
        with: { usuario: true, circuito: { columns: circuitoSafeColumns }, pagos: true, cortes: true },
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
        with: { usuario: true, circuito: { columns: circuitoSafeColumns }, pagos: true, cortes: true },
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
      with: { usuario: true, circuito: { columns: circuitoSafeColumns } },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async findByCircuitoYEstado(circuitoId: string, estado: EstadoAgua): Promise<ResidenteConRelaciones[]> {
    const rows = await db.query.perfilesResidente.findMany({
      where: (p, { eq, and }) => and(eq(p.circuitoId, circuitoId), eq(p.estadoAgua, estado)),
      with: { usuario: true, circuito: { columns: circuitoSafeColumns } },
      orderBy: (p, { desc }) => [desc(p.creadoEn)],
    });
    return rows.map(r => toConRelaciones(r as WithRelaciones));
  }

  async create(data: Omit<ResidenteData, 'id' | 'creadoEn'>): Promise<ResidenteData> {
    const row = await db.transaction(async (tx) => {
      const [circuito] = await tx
        .select({ fraccionamientoId: circuitos.fraccionamientoId })
        .from(circuitos)
        .where(eq(circuitos.id, data.circuitoId))
        .limit(1);
      if (!circuito?.fraccionamientoId) {
        throw new Error('El circuito no tiene fraccionamiento asignado');
      }

      const [inserted] = await tx.insert(perfilesResidente).values({
        userId:              data.userId,
        fraccionamientoId:   circuito.fraccionamientoId,
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

      // El signup de Better Auth no conoce el circuito todavía. El alta del
      // perfil fija ambos vínculos en una sola transacción.
      await tx.update(user)
        .set({ fraccionamientoId: circuito.fraccionamientoId, updatedAt: new Date() })
        .where(eq(user.id, data.userId));

      // Agua es el servicio base: cada perfil nuevo lo recibe al registrarse.
      const [agua] = await tx
        .select({ id: fraccionamientoServicios.id })
        .from(fraccionamientoServicios)
        .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
        .where(and(
          eq(fraccionamientoServicios.fraccionamientoId, circuito.fraccionamientoId),
          eq(fraccionamientoServicios.estado, 'activo'),
          eq(servicios.clave, 'agua'),
        ))
        .limit(1);
      if (agua) {
        await tx.insert(perfilesServicios).values({
          perfilId: inserted.id,
          fraccionamientoId: circuito.fraccionamientoId,
          fraccionamientoServicioId: agua.id,
          estadoAgua: data.estadoAgua,
          activo: true,
        });
      }
      return inserted;
    });
    return toData(row);
  }

  async findByTenantPaginated(fraccionamientoId: string, circuitoId: string | undefined, page: number, pageSize: number): Promise<PaginatedResult<ResidenteConRelaciones>> {
    const offset = (page - 1) * pageSize;
    const where = circuitoId
      ? and(eq(perfilesResidente.fraccionamientoId, fraccionamientoId), eq(perfilesResidente.circuitoId, circuitoId))
      : eq(perfilesResidente.fraccionamientoId, fraccionamientoId);
    const [rows, [{ total }]] = await Promise.all([
      db.query.perfilesResidente.findMany({
        where: (p, { and, eq }) => circuitoId ? and(eq(p.fraccionamientoId, fraccionamientoId), eq(p.circuitoId, circuitoId)) : eq(p.fraccionamientoId, fraccionamientoId),
        with: { usuario: true, circuito: { columns: circuitoSafeColumns }, pagos: true, cortes: true },
        orderBy: (p, { desc }) => [desc(p.creadoEn)],
        limit: pageSize,
        offset,
      }),
      db.select({ total: count() }).from(perfilesResidente).where(where),
    ]);
    return { items: rows.map(r => toConRelaciones(r as WithRelaciones)), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async updateEstado(id: string, estadoAgua: EstadoAgua): Promise<void> {
    await db.update(perfilesResidente)
      .set({ estadoAgua })
      .where(eq(perfilesResidente.id, id));
  }

  async marcarMorososDelMes(mes: number, anio: number): Promise<number> {
    // Pagos y operaciones de corte bloquean la misma fila de perfil. SKIP
    // LOCKED evita marcar con un snapshot viejo a quien esta pagando; las
    // siguientes ejecuciones idempotentes recogen filas omitidas.
    const result = await db.execute<{ marcados: number; ordenes: number }>(sql`
      WITH candidatos AS MATERIALIZED (
        SELECT perfil.id
        FROM perfiles_residente AS perfil
        WHERE perfil.estado_agua = 'activo'
          AND EXISTS (
            SELECT 1
            FROM perfiles_servicios AS perfil_servicio
            INNER JOIN fraccionamiento_servicios AS activacion
              ON activacion.id = perfil_servicio.fraccionamiento_servicio_id
            INNER JOIN servicios AS servicio
              ON servicio.id = activacion.servicio_id
            WHERE perfil_servicio.perfil_id = perfil.id
              AND perfil_servicio.fraccionamiento_id = perfil.fraccionamiento_id
              AND perfil_servicio.activo = true
              AND perfil_servicio.estado_agua = 'activo'
              AND servicio.clave = 'agua'
              AND servicio.con_corte_fisico = true
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pagos AS pago
            WHERE pago.perfil_id = perfil.id
              AND pago.mes = ${mes}
              AND pago.anio = ${anio}
              AND pago.estado = 'pagado'
          )
        FOR UPDATE OF perfil SKIP LOCKED
      ), marcados AS (
      UPDATE perfiles_residente AS perfil
      SET estado_agua = 'pendiente_corte'
      FROM candidatos
      WHERE perfil.id = candidatos.id
      RETURNING perfil.id, perfil.fraccionamiento_id, perfil.circuito_id
      ), ordenadas AS (
      INSERT INTO ordenes_trabajo (
        fraccionamiento_id, circuito_id, perfil_id, fraccionamiento_servicio_id,
        tipo, estado, motivo, idempotency_key
      )
      SELECT
        marcado.fraccionamiento_id,
        marcado.circuito_id,
        marcado.id,
        perfil_servicio.fraccionamiento_servicio_id,
        'corte',
        'pendiente',
        'falta_pago',
        'corte:' || marcado.id::text || ':' || ${mes}::text || ':' || ${anio}::text
      FROM marcados AS marcado
      INNER JOIN perfiles_servicios AS perfil_servicio
        ON perfil_servicio.perfil_id = marcado.id
       AND perfil_servicio.fraccionamiento_id = marcado.fraccionamiento_id
       AND perfil_servicio.activo = true
      INNER JOIN fraccionamiento_servicios AS activacion
        ON activacion.id = perfil_servicio.fraccionamiento_servicio_id
       AND activacion.fraccionamiento_id = marcado.fraccionamiento_id
       AND activacion.estado = 'activo'
      INNER JOIN servicios AS servicio
        ON servicio.id = activacion.servicio_id
       AND servicio.clave = 'agua'
       AND servicio.con_corte_fisico = true
      ON CONFLICT DO NOTHING
      RETURNING id
      )
      SELECT
        (SELECT count(*)::int FROM marcados) AS marcados,
        (SELECT count(*)::int FROM ordenadas) AS ordenes
    `);

    return Number(result.rows[0]?.marcados ?? 0);
  }
}
