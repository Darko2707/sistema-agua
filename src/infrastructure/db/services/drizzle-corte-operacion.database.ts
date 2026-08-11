import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  auditoria,
  bitacoraCortes,
  cortes,
  notificaciones,
  perfilesResidente,
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
          })
          .from(perfilesResidente)
          .where(eq(perfilesResidente.id, perfilId))
          .for('update');
        return perfil ?? null;
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
    }));
  }
}
