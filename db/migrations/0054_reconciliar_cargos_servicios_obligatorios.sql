-- Reconciliación de la transición a servicios obligatorios por fraccionamiento.
-- Primero asegura la asignación de cada servicio activo; después crea, una sola
-- vez, los cargos pendientes de servicios distintos de agua del periodo vigente.
INSERT INTO perfiles_servicios (
  perfil_id,
  fraccionamiento_id,
  fraccionamiento_servicio_id,
  estado_agua,
  activo
)
SELECT
  perfil.id,
  perfil.fraccionamiento_id,
  servicio_fraccionamiento.id,
  perfil.estado_agua,
  true
FROM perfiles_residente AS perfil
INNER JOIN fraccionamiento_servicios AS servicio_fraccionamiento
  ON servicio_fraccionamiento.fraccionamiento_id = perfil.fraccionamiento_id
  AND servicio_fraccionamiento.estado = 'activo'
INNER JOIN servicios AS servicio
  ON servicio.id = servicio_fraccionamiento.servicio_id
  AND servicio.activo = true
ON CONFLICT (perfil_id, fraccionamiento_servicio_id) DO UPDATE
SET
  activo = true,
  estado_agua = EXCLUDED.estado_agua,
  actualizado_en = CURRENT_TIMESTAMP;
--> statement-breakpoint

INSERT INTO cargos_servicios (
  fraccionamiento_id,
  perfil_id,
  fraccionamiento_servicio_id,
  mes,
  anio,
  monto,
  estado
)
SELECT
  perfil_servicio.fraccionamiento_id,
  perfil_servicio.perfil_id,
  perfil_servicio.fraccionamiento_servicio_id,
  EXTRACT(MONTH FROM CURRENT_TIMESTAMP)::integer,
  EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::integer,
  servicio_fraccionamiento.monto_mensual,
  'pendiente'
FROM perfiles_servicios AS perfil_servicio
INNER JOIN fraccionamiento_servicios AS servicio_fraccionamiento
  ON servicio_fraccionamiento.id = perfil_servicio.fraccionamiento_servicio_id
INNER JOIN servicios AS servicio
  ON servicio.id = servicio_fraccionamiento.servicio_id
WHERE perfil_servicio.activo = true
  AND servicio_fraccionamiento.estado = 'activo'
  AND servicio.activo = true
  AND servicio.clave <> 'agua'
ON CONFLICT (perfil_id, fraccionamiento_servicio_id, mes, anio) DO NOTHING;
