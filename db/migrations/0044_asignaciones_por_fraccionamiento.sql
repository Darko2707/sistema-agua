-- Las asignaciones operativas pertenecen al fraccionamiento, no a un circuito.
-- El campo legado se conserva opcionalmente para permitir consultar historial.
ALTER TABLE asignaciones_circuito
  ALTER COLUMN circuito_id DROP NOT NULL;

ALTER TABLE asignaciones_circuito
  DROP CONSTRAINT IF EXISTS asignaciones_circuito_circuito_tenant_fk;

ALTER TABLE asignaciones_circuito
  DROP CONSTRAINT IF EXISTS asignaciones_circuito_circuito_id_circuitos_id_fk;

ALTER TABLE asignaciones_circuito
  ADD CONSTRAINT asignaciones_circuito_circuito_id_circuitos_id_fk
  FOREIGN KEY (circuito_id) REFERENCES circuitos(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS uq_asignacion_circuito_persona;
DROP INDEX IF EXISTS idx_asignaciones_circuito_tenant;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_fraccionamiento_persona
  ON asignaciones_circuito (usuario_id, fraccionamiento_id, fraccionamiento_servicio_id, rol);

CREATE INDEX IF NOT EXISTS idx_asignaciones_fraccionamiento_activa
  ON asignaciones_circuito (fraccionamiento_id, activo);
