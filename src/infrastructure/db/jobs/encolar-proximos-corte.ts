import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { DIA_CORTE } from '@/src/domain/pagos/constants';
import { fechaNegocio } from '@/src/domain/shared/fecha-negocio';

// Vercel agenda este trabajo a las 15:00 UTC del dia 4. La fecha de negocio
// siempre se calcula en Mexico para no adelantar el periodo en cambios de mes.
export async function encolarProximosCorte(fecha = new Date()) {
  const periodo = fechaNegocio(fecha);
  const diaAviso = DIA_CORTE - 1;

  if (periodo.dia !== diaAviso) {
    return {
      omitido: true,
      motivo: `El aviso se genera el dia ${diaAviso}`,
      ...periodo,
      candidatos: 0,
      encoladas: 0,
    };
  }

  const periodKey = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
  // El marcado de morosos corre a las 09:00 UTC del dia siguiente al limite.
  // Caducamos media hora antes para que ningun retry deje de ser "previo".
  const expiresAt = new Date(Date.UTC(
    periodo.anio,
    periodo.mes - 1,
    DIA_CORTE + 1,
    8,
    30,
  ));

  // Seleccion e insercion comparten un unico snapshot SQL. Un pago concurrente
  // no puede colarse entre un SELECT de candidatos y el INSERT del outbox.
  const result = await db.execute<{ candidatos: number; encoladas: number }>(sql`
    WITH candidatos AS MATERIALIZED (
      SELECT perfil.id AS perfil_id, perfil.user_id
      FROM perfiles_residente AS perfil
      INNER JOIN circuitos AS circuito ON circuito.id = perfil.circuito_id
      WHERE circuito.activo = true
        AND perfil.estado_agua = 'activo'
        AND NOT EXISTS (
          SELECT 1
          FROM pagos AS pago
          WHERE pago.perfil_id = perfil.id
            AND pago.mes = ${periodo.mes}
            AND pago.anio = ${periodo.anio}
            AND pago.estado = 'pagado'
        )
      FOR UPDATE OF perfil SKIP LOCKED
    ), insertadas AS (
      INSERT INTO notificaciones (
        user_id, perfil_id, dedupe_key, canal, tipo, destino, mensaje, expires_at
      )
      SELECT
        user_id,
        perfil_id,
        'corte_proximo:' || perfil_id::text || ':' || ${periodKey},
        'push',
        'corte_proximo',
        user_id,
        'Tu pago del mes sigue pendiente. Consulta tu estado dentro de la aplicacion.',
        ${expiresAt}
      FROM candidatos
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT count(*)::int FROM candidatos) AS candidatos,
      (SELECT count(*)::int FROM insertadas) AS encoladas
  `);

  const stats = result.rows[0] ?? { candidatos: 0, encoladas: 0 };
  return {
    omitido: false,
    ...periodo,
    candidatos: Number(stats.candidatos),
    encoladas: Number(stats.encoladas),
  };
}
