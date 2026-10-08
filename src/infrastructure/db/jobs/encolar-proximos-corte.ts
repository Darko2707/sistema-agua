import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { fechaNegocio, sumarDiasFechaNegocio } from '@/src/domain/shared/fecha-negocio';

// Vercel agenda este trabajo diariamente. La fecha de negocio siempre se
// calcula en México para respetar el día configurado de cada circuito.
export async function encolarProximosCorte(fecha = new Date()) {
  const periodo = fechaNegocio(fecha);
  const periodoCobro = sumarDiasFechaNegocio(periodo, 1);
  const periodKey = `${periodoCobro.anio}-${String(periodoCobro.mes).padStart(2, '0')}`;
  // El marcado de morosos corre a las 16:00 UTC. Caducamos media hora antes
  // para que ningún retry deje de ser un aviso previo.
  const expiresAt = new Date(Date.UTC(
    periodoCobro.anio,
    periodoCobro.mes - 1,
    periodoCobro.dia,
    15,
    30,
  ));

  // Seleccion e insercion comparten un unico snapshot SQL. Un pago concurrente
  // no puede colarse entre un SELECT de candidatos y el INSERT del outbox.
  const result = await db.execute<{ candidatos: number; encoladas: number }>(sql`
    WITH candidatos AS MATERIALIZED (
      SELECT perfil.id AS perfil_id, perfil.user_id
      FROM perfiles_residente AS perfil
      INNER JOIN fraccionamientos AS fraccionamiento ON fraccionamiento.id = perfil.fraccionamiento_id
      WHERE fraccionamiento.activo = true
        AND fraccionamiento.dia_corte = ${periodoCobro.dia}
        AND perfil.estado_agua = 'activo'
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
            AND pago.mes = ${periodoCobro.mes}
            AND pago.anio = ${periodoCobro.anio}
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
    periodoCobro,
    candidatos: Number(stats.candidatos),
    encoladas: Number(stats.encoladas),
  };
}
