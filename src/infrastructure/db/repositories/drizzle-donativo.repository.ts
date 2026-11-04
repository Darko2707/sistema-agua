import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { auditoria, cargosServicios, fraccionamientos, fraccionamientoServicios, perfilesResidente, servicios, user } from '@/db/schema';

export type DonativoPeriod = { mes: number; anio: number };
export type DonativoInput = { fraccionamientoId: string; monto: number; periodos: DonativoPeriod[] };

export class DonativoRepositoryError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'PRECONDITION_FAILED' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR', message: string) {
    super(message);
    this.name = 'DonativoRepositoryError';
  }
}

async function obtenerObjetivo(fraccionamientoId: string) {
  const [tenant] = await db.select({ id: fraccionamientos.id, nombre: fraccionamientos.nombre })
    .from(fraccionamientos).where(and(eq(fraccionamientos.id, fraccionamientoId), eq(fraccionamientos.activo, true))).limit(1);
  if (!tenant) throw new DonativoRepositoryError('NOT_FOUND', 'El fraccionamiento no existe o está inactivo');

  const [concepto] = await db.select({ id: servicios.id }).from(servicios)
    .where(and(eq(servicios.clave, 'donativo'), eq(servicios.activo, true))).limit(1);
  if (!concepto) throw new DonativoRepositoryError('PRECONDITION_FAILED', 'El concepto Donativo no está instalado; aplica las migraciones pendientes');

  return { tenant, servicioId: concepto.id };
}

async function viviendasElegibles(fraccionamientoId: string) {
  return db.select({
    perfilId: perfilesResidente.id,
    nombre: user.name,
    edificio: perfilesResidente.edificio,
    departamento: perfilesResidente.departamento,
  }).from(perfilesResidente)
    .innerJoin(user, eq(user.id, perfilesResidente.userId))
    .where(and(
      eq(perfilesResidente.fraccionamientoId, fraccionamientoId),
      eq(user.fraccionamientoId, fraccionamientoId),
      eq(user.responsableCargos, true),
      isNull(user.deletedAt),
    ))
    .orderBy(asc(user.name), asc(perfilesResidente.edificio), asc(perfilesResidente.departamento));
}

export class DrizzleDonativoRepository {
  async previsualizar(input: DonativoInput) {
    const [{ tenant, servicioId }, viviendas] = await Promise.all([
      obtenerObjetivo(input.fraccionamientoId),
      viviendasElegibles(input.fraccionamientoId),
    ]);
    const [activation] = await db.select({ id: fraccionamientoServicios.id })
      .from(fraccionamientoServicios)
      .where(and(eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId), eq(fraccionamientoServicios.servicioId, servicioId)))
      .limit(1);
    const existing = activation
      ? await db.select({ perfilId: cargosServicios.perfilId, mes: cargosServicios.mes, anio: cargosServicios.anio })
        .from(cargosServicios)
        .where(and(eq(cargosServicios.fraccionamientoId, input.fraccionamientoId), eq(cargosServicios.fraccionamientoServicioId, activation.id)))
      : [];
    const existingKeys = new Set(existing.map(charge => `${charge.perfilId}:${charge.anio}:${charge.mes}`));
    const duplicados = viviendas.reduce((count, home) => count + input.periodos.filter(period => existingKeys.has(`${home.perfilId}:${period.anio}:${period.mes}`)).length, 0);
    return {
      fraccionamiento: tenant.nombre,
      montoUnitario: input.monto.toFixed(2),
      periodos: input.periodos,
      viviendas,
      totalCargos: viviendas.length * input.periodos.length,
      importeTotal: (viviendas.length * input.periodos.length * input.monto).toFixed(2),
      duplicados,
    };
  }

  async generar(input: DonativoInput, actorId: string) {
    const { tenant, servicioId } = await obtenerObjetivo(input.fraccionamientoId);
    const monto = input.monto.toFixed(2);

    return db.transaction(async tx => {
      let [activation] = await tx.select({ id: fraccionamientoServicios.id })
        .from(fraccionamientoServicios)
        .where(and(eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId), eq(fraccionamientoServicios.servicioId, servicioId)))
        .limit(1);

      if (!activation) {
        await tx.insert(fraccionamientoServicios).values({
          fraccionamientoId: input.fraccionamientoId,
          servicioId,
          estado: 'inactivo',
          montoMensual: '0.00',
          montoReconexion: '0.00',
        }).onConflictDoNothing();
        [activation] = await tx.select({ id: fraccionamientoServicios.id })
          .from(fraccionamientoServicios)
          .where(and(eq(fraccionamientoServicios.fraccionamientoId, input.fraccionamientoId), eq(fraccionamientoServicios.servicioId, servicioId)))
          .limit(1);
      }
      if (!activation) throw new DonativoRepositoryError('INTERNAL_SERVER_ERROR', 'No se pudo preparar el concepto Donativo');

      const homes = await tx.select({ perfilId: perfilesResidente.id })
        .from(perfilesResidente)
        .innerJoin(user, eq(user.id, perfilesResidente.userId))
        .where(and(
          eq(perfilesResidente.fraccionamientoId, input.fraccionamientoId),
          eq(user.fraccionamientoId, input.fraccionamientoId),
          eq(user.responsableCargos, true),
          isNull(user.deletedAt),
        ));
      if (homes.length === 0) throw new DonativoRepositoryError('PRECONDITION_FAILED', 'No hay viviendas elegibles para este fraccionamiento');

      const existing = await tx.select({ perfilId: cargosServicios.perfilId, mes: cargosServicios.mes, anio: cargosServicios.anio })
        .from(cargosServicios)
        .where(and(eq(cargosServicios.fraccionamientoId, input.fraccionamientoId), eq(cargosServicios.fraccionamientoServicioId, activation.id)));
      const existingKeys = new Set(existing.map(charge => `${charge.perfilId}:${charge.anio}:${charge.mes}`));
      const requestedKeys = new Set(input.periodos.flatMap(period => homes.map(home => `${home.perfilId}:${period.anio}:${period.mes}`)));
      if ([...requestedKeys].some(key => existingKeys.has(key))) {
        throw new DonativoRepositoryError('CONFLICT', 'Ya existen donativos para una o más viviendas y periodos seleccionados');
      }

      const rows = input.periodos.flatMap(period => homes.map(home => ({
        fraccionamientoId: input.fraccionamientoId,
        perfilId: home.perfilId,
        fraccionamientoServicioId: activation.id,
        mes: period.mes,
        anio: period.anio,
        monto,
        estado: 'pendiente' as const,
      })));
      let insertedCount = 0;
      for (let offset = 0; offset < rows.length; offset += 250) {
        const inserted = await tx.insert(cargosServicios).values(rows.slice(offset, offset + 250))
          .onConflictDoNothing().returning({ id: cargosServicios.id });
        insertedCount += inserted.length;
      }
      if (insertedCount !== rows.length) {
        throw new DonativoRepositoryError('CONFLICT', 'Se detectó un cargo duplicado; no se generó ningún donativo');
      }

      await tx.insert(auditoria).values({
        actorId,
        accion: 'donativo.cargos.generados',
        entidad: 'cargos_servicios',
        entidadId: activation.id,
        detalle: {
          fraccionamientoId: tenant.id,
          fraccionamiento: tenant.nombre,
          servicioClave: 'donativo',
          monto,
          periodos: input.periodos,
          viviendas: homes.length,
          cargos: insertedCount,
          importeTotal: (Number(monto) * insertedCount).toFixed(2),
        },
      });
      return { generados: insertedCount, viviendas: homes.length, importeTotal: (Number(monto) * insertedCount).toFixed(2) };
    });
  }
}
