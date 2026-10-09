-- Los servicios configurados como activos para un fraccionamiento son
-- obligatorios para todos sus residentes. Reconcilia perfiles existentes
-- al desplegar el cambio y puede ejecutarse más de una vez sin duplicarlos.
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
