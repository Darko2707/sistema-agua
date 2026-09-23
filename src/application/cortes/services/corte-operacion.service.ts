import { TRPCError } from '@trpc/server';

import {
  ACCIONES,
  aplicarTransicionServicio,
  type EstadoAgua,
  type ServicioOperable,
} from '@/src/domain/agua/state-machine';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';

export type PerfilCorteBloqueado = {
  id: string;
  userId: string;
  estadoAgua: EstadoAgua;
  fraccionamientoId?: string | null;
  circuitoId?: string | null;
  fraccionamientoServicioId?: string | null;
  servicio?: ServicioOperable;
};

export type CorteOperacionData = {
  id: string;
  perfilId: string;
  trabajadorId: string;
  motivo: string;
  activo: boolean | null;
  fechaCorte: Date | null;
  fechaReconexion: Date | null;
  reconectadoPor: string | null;
};

export type OrdenTrabajoData = {
  id: string;
  perfilId: string;
  tipo: 'corte' | 'reconexion';
  estado: 'pendiente' | 'asignada' | 'en_progreso' | 'completada' | 'cancelada';
  trabajadorId: string | null;
  corteId: string | null;
};

export interface CorteOperacionTransaction {
  lockPerfil(perfilId: string): Promise<PerfilCorteBloqueado | null>;
  createCorte(input: {
    perfilId: string;
    trabajadorId: string;
    motivo: 'falta_pago';
    fecha: Date;
  }): Promise<CorteOperacionData>;
  lockCorteActivo(perfilId: string): Promise<CorteOperacionData | null>;
  closeCorte(input: {
    corteId: string;
    fecha: Date;
    actorId: string;
  }): Promise<void>;
  updateEstadoPerfil(perfilId: string, estado: EstadoAgua): Promise<void>;
  insertBitacora(input: {
    perfilId: string;
    corteId: string | null;
    actorId: string;
    accion: 'corte_confirmado' | 'reconexion_confirmada';
    nota: string;
  }): Promise<{ id: string }>;
  insertAuditoria(input: {
    actorId: string;
    accion: 'corte.confirmado' | 'reconexion.confirmada';
    entidadId: string;
    perfilId: string;
  }): Promise<void>;
  insertPushNotification(input: PushNotificationInput): Promise<void>;
  /** Optional during rollout; production adapters persist orders atomically. */
  lockOrdenTrabajo?(input: {
    ordenId: string;
    perfilId: string;
    tipo: 'corte' | 'reconexion';
  }): Promise<OrdenTrabajoData | null>;
  updateOrdenTrabajo?(input: {
    ordenId: string;
    estado: 'en_progreso' | 'completada';
    actorId: string;
    fecha: Date;
    corteId?: string;
  }): Promise<void>;
  recordOrdenTrabajo?(input: {
    fraccionamientoId: string;
    circuitoId: string;
    perfilId: string;
    fraccionamientoServicioId: string;
    tipo: 'corte' | 'reconexion';
    trabajadorId: string;
    creadoPor: string;
    ejecutadoPor: string;
    corteId: string;
    motivo: string;
    idempotencyKey: string;
    fecha: Date;
  }): Promise<void>;
}

export interface CorteOperacionDatabase {
  transaction<T>(work: (tx: CorteOperacionTransaction) => Promise<T>): Promise<T>;
}

function transicionOError(
  estado: EstadoAgua,
  accion: typeof ACCIONES.EJECUTAR_CORTE
    | typeof ACCIONES.EJECUTAR_RECONEXION
    | typeof ACCIONES.RECONEXION_DIRECTA,
  fecha: Date,
  actorId: string,
) {
  try {
    return aplicarTransicionServicio(estado, accion, { fecha, actorId });
  } catch (error) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error instanceof Error ? error.message : 'Transición inválida',
    });
  }
}

/**
 * Coordina el cambio de estado y todos sus efectos persistentes dentro de una
 * única transacción. El bloqueo del perfil convierte solicitudes simultáneas
 * para la misma vivienda en operaciones estrictamente seriales.
 */
export class CorteOperacionService {
  constructor(
    private readonly database: CorteOperacionDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async confirmarCorte(input: { perfilId: string; trabajadorId: string; ordenId?: string }): Promise<CorteOperacionData> {
    return this.database.transaction(async (tx) => {
      const perfil = await tx.lockPerfil(input.perfilId);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });
      if (perfil.servicio && !perfil.servicio.conCorteFisico) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `El servicio "${perfil.servicio.clave}" no permite cortes físicos` });
      }

      if (input.ordenId && tx.lockOrdenTrabajo) {
        const orden = await tx.lockOrdenTrabajo({ ordenId: input.ordenId, perfilId: input.perfilId, tipo: 'corte' });
        if (!orden) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orden de corte no encontrada' });
        if (orden.estado === 'completada' || orden.estado === 'cancelada') {
          throw new TRPCError({ code: 'CONFLICT', message: 'La orden de corte ya no está disponible' });
        }
        if (orden.trabajadorId && orden.trabajadorId !== input.trabajadorId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'La orden está asignada a otra cuadrilla' });
        }
        await tx.updateOrdenTrabajo?.({ ordenId: orden.id, estado: 'en_progreso', actorId: input.trabajadorId, fecha: this.now() });
      }

      const fecha = this.now();
      const resultado = transicionOError(
        perfil.estadoAgua,
        ACCIONES.EJECUTAR_CORTE,
        fecha,
        input.trabajadorId,
      );
      const efecto = resultado.efectos.find((item) => item.tipo === 'crear_corte');
      if (!efecto || efecto.tipo !== 'crear_corte') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'La transición no generó el corte esperado' });
      }

      const corte = await tx.createCorte({
        perfilId: input.perfilId,
        trabajadorId: efecto.trabajadorId,
        motivo: efecto.motivo,
        fecha: efecto.fecha,
      });
      if (input.ordenId && tx.updateOrdenTrabajo) {
        await tx.updateOrdenTrabajo({
          ordenId: input.ordenId,
          estado: 'completada',
          actorId: input.trabajadorId,
          fecha: efecto.fecha,
          corteId: corte.id,
        });
      } else if (tx.recordOrdenTrabajo && perfil.fraccionamientoId && perfil.circuitoId && perfil.fraccionamientoServicioId) {
        await tx.recordOrdenTrabajo({
          fraccionamientoId: perfil.fraccionamientoId,
          circuitoId: perfil.circuitoId,
          perfilId: input.perfilId,
          fraccionamientoServicioId: perfil.fraccionamientoServicioId,
          tipo: 'corte',
          trabajadorId: input.trabajadorId,
          creadoPor: input.trabajadorId,
          ejecutadoPor: input.trabajadorId,
          corteId: corte.id,
          motivo: efecto.motivo,
          idempotencyKey: `corte:${corte.id}`,
          fecha: efecto.fecha,
        });
      }
      await tx.updateEstadoPerfil(input.perfilId, resultado.nuevoEstado);
      await tx.insertBitacora({
        perfilId: input.perfilId,
        corteId: corte.id,
        actorId: input.trabajadorId,
        accion: 'corte_confirmado',
        nota: 'Corte confirmado desde el panel operativo',
      });
      await tx.insertAuditoria({
        actorId: input.trabajadorId,
        accion: 'corte.confirmado',
        entidadId: corte.id,
        perfilId: input.perfilId,
      });
      await tx.insertPushNotification({
        userId: perfil.userId,
        perfilId: input.perfilId,
        tipo: 'corte_confirmado',
        mensaje: 'Tu servicio fue marcado como cortado. Abre la app para consultar tu estado.',
        dedupeKey: `corte_confirmado:${corte.id}`,
      });

      return corte;
    });
  }

  async confirmarReconexion(input: { perfilId: string; actorId: string; ordenId?: string }): Promise<{
    ok: true;
    corteId: string | null;
  }> {
    return this.database.transaction(async (tx) => {
      const perfil = await tx.lockPerfil(input.perfilId);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });
      if (perfil.servicio && !perfil.servicio.conCorteFisico) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `El servicio "${perfil.servicio.clave}" no permite reconexiones físicas` });
      }

      if (input.ordenId && tx.lockOrdenTrabajo) {
        const orden = await tx.lockOrdenTrabajo({ ordenId: input.ordenId, perfilId: input.perfilId, tipo: 'reconexion' });
        if (!orden) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orden de reconexión no encontrada' });
        if (orden.estado === 'completada' || orden.estado === 'cancelada') {
          throw new TRPCError({ code: 'CONFLICT', message: 'La orden de reconexión ya no está disponible' });
        }
        if (orden.trabajadorId && orden.trabajadorId !== input.actorId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'La orden está asignada a otra cuadrilla' });
        }
        await tx.updateOrdenTrabajo?.({ ordenId: orden.id, estado: 'en_progreso', actorId: input.actorId, fecha: this.now() });
      }

      const fecha = this.now();
      const accion = perfil.estadoAgua === 'pendiente_reconexion'
        ? ACCIONES.EJECUTAR_RECONEXION
        : ACCIONES.RECONEXION_DIRECTA;
      const resultado = transicionOError(perfil.estadoAgua, accion, fecha, input.actorId);
      const efecto = resultado.efectos.find((item) => item.tipo === 'cerrar_corte');
      if (!efecto || efecto.tipo !== 'cerrar_corte') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'La transición no generó la reconexión esperada' });
      }

      const corteActivo = await tx.lockCorteActivo(input.perfilId);
      if (!corteActivo) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'No existe un corte activo para confirmar la reconexión',
        });
      }
      await tx.closeCorte({
        corteId: corteActivo.id,
        fecha: efecto.fecha,
        actorId: efecto.reconectadoPor ?? input.actorId,
      });
      if (input.ordenId && tx.updateOrdenTrabajo) {
        await tx.updateOrdenTrabajo({
          ordenId: input.ordenId,
          estado: 'completada',
          actorId: input.actorId,
          fecha: efecto.fecha,
          corteId: corteActivo.id,
        });
      } else if (tx.recordOrdenTrabajo && perfil.fraccionamientoId && perfil.circuitoId && perfil.fraccionamientoServicioId) {
        await tx.recordOrdenTrabajo({
          fraccionamientoId: perfil.fraccionamientoId,
          circuitoId: perfil.circuitoId,
          perfilId: input.perfilId,
          fraccionamientoServicioId: perfil.fraccionamientoServicioId,
          tipo: 'reconexion',
          trabajadorId: input.actorId,
          creadoPor: input.actorId,
          ejecutadoPor: input.actorId,
          corteId: corteActivo.id,
          motivo: 'reconexion_fisica',
          idempotencyKey: `reconexion:${corteActivo.id}`,
          fecha: efecto.fecha,
        });
      }
      await tx.updateEstadoPerfil(input.perfilId, resultado.nuevoEstado);
      await tx.insertBitacora({
        perfilId: input.perfilId,
        corteId: corteActivo.id,
        actorId: input.actorId,
        accion: 'reconexion_confirmada',
        nota: 'Reconexion confirmada desde el panel operativo',
      });
      await tx.insertAuditoria({
        actorId: input.actorId,
        accion: 'reconexion.confirmada',
        entidadId: corteActivo.id,
        perfilId: input.perfilId,
      });
      await tx.insertPushNotification({
        userId: perfil.userId,
        perfilId: input.perfilId,
        tipo: 'reconexion_confirmada',
        mensaje: 'Tu reconexión fue confirmada. Abre la app para consultar tu estado.',
        dedupeKey: `reconexion_confirmada:${corteActivo.id}`,
      });

      return { ok: true, corteId: corteActivo.id };
    });
  }
}
