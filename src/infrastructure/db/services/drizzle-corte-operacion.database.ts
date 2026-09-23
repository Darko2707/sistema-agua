import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  auditoria,
  bitacoraCortes,
  cortes,
  notificaciones,
  perfilesResidente,
  perfilesServicios,
  fraccionamientoServicios,
  servicios,
  ordenesTrabajo,
} from '@/db/schema';
import type {
  CorteOperacionDatabase,
  CorteOperacionTransaction,
} from '@/src/application/cortes/services/corte-operacion.service';
import { pushNotificationValues } from '@/src/infrastructure/db/push-notification-outbox';

export class DrizzleCorteOperacionDatabase implements CorteOperacionDatabase {
  async transaction<T>(work: (tx: CorteOperacionTransaction) => Promise<T>): Promise<T> {
    return db.transaction(async (databaseTx) => work({
      async lockPerfil(perfilId) {
        const [perfil] = await databaseTx
          .select({
            id: perfilesResidente.id,
            userId: perfilesResidente.userId,
            estadoAgua: perfilesResidente.estadoAgua,
            fraccionamientoId: perfilesResidente.fraccionamientoId,
            circuitoId: perfilesResidente.circuitoId,
          })
          .from(perfilesResidente)
          .where(eq(perfilesResidente.id, perfilId))
          .for('update');
        if (!perfil) return null;
        const [servicio] = await databaseTx
          .select({
            clave: servicios.clave,
            conCorteFisico: servicios.conCorteFisico,
            fraccionamientoServicioId: fraccionamientoServicios.id,
          })
          .from(perfilesServicios)
          .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, perfilesServicios.fraccionamientoServicioId))
          .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
          .where(and(
            eq(perfilesServicios.perfilId, perfilId),
            eq(perfilesServicios.activo, true),
            eq(servicios.clave, 'agua'),
          ))
          .limit(1);
        return servicio ? { ...perfil, fraccionamientoServicioId: servicio.fraccionamientoServicioId, servicio } : perfil;
      },

      async createCorte(input) {
        const [corte] = await databaseTx
          .insert(cortes)
          .values({
            perfilId: input.perfilId,
            trabajadorId: input.trabajadorId,
            motivo: input.motivo,
            activo: true,
            fechaCorte: input.fecha,
            updatedAt: input.fecha,
          })
          .returning();
        return corte;
      },

      async lockCorteActivo(perfilId) {
        const [corte] = await databaseTx
          .select()
          .from(cortes)
          .where(and(eq(cortes.perfilId, perfilId), eq(cortes.activo, true)))
          .limit(1)
          .for('update');
        return corte ?? null;
      },

      async closeCorte(input) {
        await databaseTx
          .update(cortes)
          .set({
            activo: false,
            fechaReconexion: input.fecha,
            reconectadoPor: input.actorId,
            updatedAt: input.fecha,
          })
          .where(eq(cortes.id, input.corteId));
      },

      async updateEstadoPerfil(perfilId, estado) {
        await databaseTx
          .update(perfilesResidente)
          .set({ estadoAgua: estado })
          .where(eq(perfilesResidente.id, perfilId));
      },

      async insertBitacora(input) {
        const [row] = await databaseTx
          .insert(bitacoraCortes)
          .values(input)
          .returning({ id: bitacoraCortes.id });
        return row;
      },

      async insertAuditoria(input) {
        await databaseTx.insert(auditoria).values({
          actorId: input.actorId,
          accion: input.accion,
          entidad: 'corte',
          entidadId: input.entidadId,
          detalle: { perfilId: input.perfilId },
        });
      },

      async insertPushNotification(input) {
        await databaseTx
          .insert(notificaciones)
          .values(pushNotificationValues(input));
      },

      async lockOrdenTrabajo(input) {
        const [orden] = await databaseTx
          .select({
            id: ordenesTrabajo.id,
            perfilId: ordenesTrabajo.perfilId,
            tipo: ordenesTrabajo.tipo,
            estado: ordenesTrabajo.estado,
            trabajadorId: ordenesTrabajo.trabajadorId,
            corteId: ordenesTrabajo.corteId,
          })
          .from(ordenesTrabajo)
          .where(and(
            eq(ordenesTrabajo.id, input.ordenId),
            eq(ordenesTrabajo.perfilId, input.perfilId),
            eq(ordenesTrabajo.tipo, input.tipo),
          ))
          .limit(1)
          .for('update');
        return orden ?? null;
      },

      async updateOrdenTrabajo(input) {
        const values = input.estado === 'en_progreso'
          ? {
            estado: input.estado,
            trabajadorId: input.actorId,
            ejecutadoPor: input.actorId,
            iniciadoEn: input.fecha,
            actualizadoEn: input.fecha,
          }
          : {
            estado: input.estado,
            ejecutadoPor: input.actorId,
            corteId: input.corteId,
            completadoEn: input.fecha,
            actualizadoEn: input.fecha,
          };
        await databaseTx
          .update(ordenesTrabajo)
          .set(values)
          .where(eq(ordenesTrabajo.id, input.ordenId));
      },

      async recordOrdenTrabajo(input) {
        await databaseTx
          .insert(ordenesTrabajo)
          .values({
            fraccionamientoId: input.fraccionamientoId,
            circuitoId: input.circuitoId,
            perfilId: input.perfilId,
            fraccionamientoServicioId: input.fraccionamientoServicioId,
            tipo: input.tipo,
            estado: 'completada',
            trabajadorId: input.trabajadorId,
            creadoPor: input.creadoPor,
            ejecutadoPor: input.ejecutadoPor,
            corteId: input.corteId,
            motivo: input.motivo,
            idempotencyKey: input.idempotencyKey,
            creadoEn: input.fecha,
            iniciadoEn: input.fecha,
            completadoEn: input.fecha,
            actualizadoEn: input.fecha,
          })
          .onConflictDoNothing({ target: ordenesTrabajo.idempotencyKey });
      },
    }));
  }
}
