import { and, desc, eq, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { db } from '@/db';
import {
  auditoria,
  circuitos,
  perfilesResidente,
  solicitudesCambioPerfil,
} from '@/db/schema';
import { PerfilCambiosSchema, type PerfilCambios } from '@/src/application/residentes/profile-change';

type Snapshot = {
  telefono: string;
  sexo: string;
  tenencia: string;
  circuitoId: string;
  edificio: string;
  departamento: string;
  nombrePropietario: string | null;
  telefonoPropietario: string | null;
};

function snapshot(perfil: typeof perfilesResidente.$inferSelect): Snapshot {
  return {
    telefono: perfil.telefono,
    sexo: perfil.sexo,
    tenencia: perfil.tenencia,
    circuitoId: perfil.circuitoId,
    edificio: perfil.edificio,
    departamento: perfil.departamento,
    nombrePropietario: perfil.nombrePropietario,
    telefonoPropietario: perfil.telefonoPropietario,
  };
}

function proposed(current: Snapshot, changes: PerfilCambios): Snapshot {
  return {
    ...current,
    ...changes,
    telefono: changes.telefono ?? current.telefono,
    sexo: changes.sexo ?? current.sexo,
    tenencia: changes.tenencia ?? current.tenencia,
    circuitoId: changes.circuitoId ?? current.circuitoId,
    edificio: changes.edificio ?? current.edificio,
    departamento: changes.departamento ?? current.departamento,
    nombrePropietario: changes.nombrePropietario !== undefined
      ? changes.nombrePropietario
      : current.nombrePropietario,
    telefonoPropietario: changes.telefonoPropietario !== undefined
      ? changes.telefonoPropietario
      : current.telefonoPropietario,
  };
}

function validateOwnership(data: Snapshot): void {
  if (data.tenencia === 'inquilino') {
    if (!data.nombrePropietario || !data.telefonoPropietario) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Los datos del propietario son obligatorios para inquilinos' });
    }
  } else {
    data.nombrePropietario = null;
    data.telefonoPropietario = null;
  }
}

function isSameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class ProfileChangeService {
  async createRequest(input: {
    actorId: string;
    tenantId: string;
    perfilId: string;
    cambios: PerfilCambios;
    motivo: string;
  }) {
    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq, and }) => and(eq(p.id, input.perfilId), eq(p.fraccionamientoId, input.tenantId)),
    });
    if (!perfil || perfil.userId !== input.actorId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo puedes solicitar cambios para tu propio perfil' });
    }

    const anterior = snapshot(perfil);
    const nuevos = proposed(anterior, input.cambios);
    validateOwnership(nuevos);
    if (isSameSnapshot(anterior, nuevos)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No hay cambios para solicitar' });
    }

    const circuitoDestino = await db.query.circuitos.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, nuevos.circuitoId), eq(c.fraccionamientoId, input.tenantId), eq(c.activo, true)),
    });
    if (!circuitoDestino) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'El circuito destino no pertenece al fraccionamiento o esta inactivo' });
    }

    try {
      const [request] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(solicitudesCambioPerfil).values({
          perfilId: input.perfilId,
          fraccionamientoId: input.tenantId,
          solicitanteId: input.actorId,
          estado: 'pendiente',
          valoresAnteriores: anterior,
          valoresNuevos: nuevos,
          motivo: input.motivo.trim(),
        }).returning({ id: solicitudesCambioPerfil.id, estado: solicitudesCambioPerfil.estado });

        await tx.insert(auditoria).values({
          actorId: input.actorId,
          accion: 'perfil.cambio.solicitado',
          entidad: 'solicitudes_cambio_perfil',
          entidadId: created.id,
          detalle: { fraccionamientoId: input.tenantId, perfilId: input.perfilId, valoresNuevos: nuevos },
        });
        return [created];
      });
      return request;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ya existe una solicitud pendiente para este perfil' });
      }
      throw error;
    }
  }

  async listPending(input: { actorId: string; tenantId: string }) {
    const circuito = await db.query.circuitos.findFirst({
      where: (c, { eq, and }) => and(eq(c.representanteId, input.actorId), eq(c.fraccionamientoId, input.tenantId)),
      columns: { id: true },
    });
    if (!circuito) return [];

    const rows = await db
      .select({
        id: solicitudesCambioPerfil.id,
        perfilId: solicitudesCambioPerfil.perfilId,
        estado: solicitudesCambioPerfil.estado,
        valoresAnteriores: solicitudesCambioPerfil.valoresAnteriores,
        valoresNuevos: solicitudesCambioPerfil.valoresNuevos,
        motivo: solicitudesCambioPerfil.motivo,
        solicitadoEn: solicitudesCambioPerfil.solicitadoEn,
        perfilCircuitoId: perfilesResidente.circuitoId,
        perfilEdificio: perfilesResidente.edificio,
        perfilDepartamento: perfilesResidente.departamento,
      })
      .from(solicitudesCambioPerfil)
      .innerJoin(perfilesResidente, eq(perfilesResidente.id, solicitudesCambioPerfil.perfilId))
      .where(and(
        eq(solicitudesCambioPerfil.fraccionamientoId, input.tenantId),
        eq(solicitudesCambioPerfil.estado, 'pendiente'),
      ))
      .orderBy(desc(solicitudesCambioPerfil.solicitadoEn));

    return rows.filter(row => {
      const nuevos = row.valoresNuevos as Partial<Snapshot>;
      return row.perfilCircuitoId === circuito.id || nuevos.circuitoId === circuito.id;
    });
  }

  async listMine(input: { actorId: string; tenantId: string }) {
    return db.query.solicitudesCambioPerfil.findMany({
      where: (s, { eq, and }) => and(
        eq(s.solicitanteId, input.actorId),
        eq(s.fraccionamientoId, input.tenantId),
      ),
      orderBy: (s, { desc }) => [desc(s.solicitadoEn)],
    });
  }

  async resolve(input: {
    actorId: string;
    actorRole: 'admin' | 'representante';
    tenantId: string | null | undefined;
    solicitudId: string;
    decision: 'aprobar' | 'rechazar';
    motivo?: string;
  }) {
    if (!input.tenantId && input.actorRole !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'La cuenta no tiene fraccionamiento asignado' });
    }

    const tenantId = input.tenantId;
    const request = await db.query.solicitudesCambioPerfil.findFirst({
      where: (s, { eq, and }) => and(
        eq(s.id, input.solicitudId),
        ...(tenantId ? [eq(s.fraccionamientoId, tenantId)] : []),
        eq(s.estado, 'pendiente'),
      ),
    });
    if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud pendiente no encontrada' });

    const perfil = await db.query.perfilesResidente.findFirst({
      where: (p, { eq }) => eq(p.id, request.perfilId),
    });
    if (!perfil || perfil.fraccionamientoId !== request.fraccionamientoId) {
      throw new TRPCError({ code: 'CONFLICT', message: 'El perfil ya no tiene una pertenencia consistente' });
    }
    const parsed = PerfilCambiosSchema.safeParse(request.valoresNuevos);
    if (!parsed.success) {
      throw new TRPCError({ code: 'CONFLICT', message: 'La solicitud contiene datos invalidos' });
    }
    const nuevos = proposed(snapshot(perfil), parsed.data);
    validateOwnership(nuevos);

    const circuitoActual = await db.query.circuitos.findFirst({
      where: (c, { eq }) => eq(c.id, perfil.circuitoId),
      columns: { id: true, representanteId: true, fraccionamientoId: true },
    });
    const circuitoDestino = await db.query.circuitos.findFirst({
      where: (c, { eq, and }) => and(eq(c.id, nuevos.circuitoId), eq(c.fraccionamientoId, request.fraccionamientoId), eq(c.activo, true)),
      columns: { id: true, representanteId: true },
    });
    if (!circuitoActual || !circuitoDestino) {
      throw new TRPCError({ code: 'CONFLICT', message: 'El circuito de la solicitud ya no es valido' });
    }
    if (input.actorRole === 'representante' && (
      circuitoActual.representanteId !== input.actorId ||
      circuitoDestino.id !== circuitoActual.id
    )) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el representante del circuito puede aprobar cambios; los traslados requieren admin' });
    }

    return db.transaction(async (tx) => {
      const [claimed] = await tx.update(solicitudesCambioPerfil)
        .set({
          estado: input.decision === 'aprobar' ? 'aprobada' : 'rechazada',
          aprobadorId: input.actorId,
          resueltoEn: new Date(),
        })
        .where(and(eq(solicitudesCambioPerfil.id, input.solicitudId), eq(solicitudesCambioPerfil.estado, 'pendiente')))
        .returning({ id: solicitudesCambioPerfil.id });
      if (!claimed) throw new TRPCError({ code: 'CONFLICT', message: 'La solicitud ya fue resuelta por otro usuario' });

      if (input.decision === 'aprobar') {
        const [ocupada] = await tx.select({ id: perfilesResidente.id })
          .from(perfilesResidente)
          .where(and(
            eq(perfilesResidente.fraccionamientoId, request.fraccionamientoId),
            eq(perfilesResidente.circuitoId, nuevos.circuitoId),
            eq(perfilesResidente.edificio, nuevos.edificio),
            eq(perfilesResidente.departamento, nuevos.departamento),
            ne(perfilesResidente.id, perfil.id),
          ))
          .limit(1);
        if (ocupada) throw new TRPCError({ code: 'CONFLICT', message: 'La vivienda destino ya esta ocupada' });

        await tx.update(perfilesResidente).set({
          telefono: nuevos.telefono,
          sexo: nuevos.sexo as 'masculino' | 'femenino' | 'otro',
          tenencia: nuevos.tenencia as 'propietario' | 'inquilino',
          circuitoId: nuevos.circuitoId,
          edificio: nuevos.edificio,
          departamento: nuevos.departamento,
          nombrePropietario: nuevos.nombrePropietario,
          telefonoPropietario: nuevos.telefonoPropietario,
        }).where(eq(perfilesResidente.id, perfil.id));
      }

      await tx.insert(auditoria).values({
        actorId: input.actorId,
        accion: `perfil.cambio.${input.decision === 'aprobar' ? 'aprobado' : 'rechazado'}`,
        entidad: 'perfiles_residente',
        entidadId: perfil.id,
        detalle: {
          fraccionamientoId: request.fraccionamientoId,
          solicitudId: request.id,
          valoresAnteriores: request.valoresAnteriores,
          valoresNuevos: request.valoresNuevos,
          motivo: input.motivo?.trim() ?? null,
        },
      });
      return { id: request.id, estado: input.decision === 'aprobar' ? 'aprobada' : 'rechazada' as const };
    });
  }
}

export const profileChangeService = new ProfileChangeService();
