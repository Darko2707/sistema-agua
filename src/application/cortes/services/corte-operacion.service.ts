import { TRPCError } from '@trpc/server';

import {
  ACCIONES,
  aplicarTransicion,
  type EstadoAgua,
} from '@/src/domain/agua/state-machine';
import type { PushNotificationInput } from '@/src/application/ports/push-notification';

export type PerfilCorteBloqueado = {
  id: string;
  userId: string;
  estadoAgua: EstadoAgua;
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
    return aplicarTransicion(estado, accion, { fecha, actorId });
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

  async confirmarCorte(input: { perfilId: string; trabajadorId: string }): Promise<CorteOperacionData> {
    return this.database.transaction(async (tx) => {
      const perfil = await tx.lockPerfil(input.perfilId);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });

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

  async confirmarReconexion(input: { perfilId: string; actorId: string }): Promise<{
    ok: true;
    corteId: string | null;
  }> {
    return this.database.transaction(async (tx) => {
      const perfil = await tx.lockPerfil(input.perfilId);
      if (!perfil) throw new TRPCError({ code: 'NOT_FOUND' });

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
