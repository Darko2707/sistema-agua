import { and, desc, eq, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { db } from '@/db';
import {
  auditoria,
  perfilesResidente,
  solicitudesCambioPerfil,
} from '@/db/schema';
import { PerfilCambiosSchema, type PerfilCambios } from '@/src/application/residentes/profile-change';

type Snapshot = {
  telefono: string;
  sexo: string;
  tenencia: string;
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
    const fraccionamiento = await db.query.fraccionamientos.findFirst({
      where: (f, { eq, and }) => and(eq(f.representanteId, input.actorId), eq(f.id, input.tenantId), eq(f.activo, true)),
      columns: { id: true },
    });
    if (!fraccionamiento) return [];

    const rows = await db
      .select({
        id: solicitudesCambioPerfil.id,
        perfilId: solicitudesCambioPerfil.perfilId,
        estado: solicitudesCambioPerfil.estado,
        valoresAnteriores: solicitudesCambioPerfil.valoresAnteriores,
        valoresNuevos: solicitudesCambioPerfil.valoresNuevos,
        motivo: solicitudesCambioPerfil.motivo,
        solicitadoEn: solicitudesCambioPerfil.solicitadoEn,
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

    return rows;
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
    // Las solicitudes creadas antes de esta migración pueden conservar un
    // circuitoId en su JSON. Es un dato legado: no debe impedir resolver una
    // solicitud válida ni permitir mover al residente fuera del tenant.
    const valoresSinCircuito = { ...(request.valoresNuevos as Record<string, unknown>) };
    delete valoresSinCircuito.circuitoId;
    const parsed = PerfilCambiosSchema.safeParse(valoresSinCircuito);
    if (!parsed.success) {
      throw new TRPCError({ code: 'CONFLICT', message: 'La solicitud contiene datos invalidos' });
    }
    const nuevos = proposed(snapshot(perfil), parsed.data);
    validateOwnership(nuevos);

    const fraccionamientoActual = await db.query.fraccionamientos.findFirst({
      where: (f, { eq }) => eq(f.id, perfil.fraccionamientoId!),
      columns: { id: true, representanteId: true, activo: true },
    });
    if (!fraccionamientoActual?.activo) {
      throw new TRPCError({ code: 'CONFLICT', message: 'El fraccionamiento de la solicitud ya no es valido' });
    }
    if (input.actorRole === 'representante' && fraccionamientoActual.representanteId !== input.actorId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el representante del fraccionamiento puede aprobar cambios' });
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
