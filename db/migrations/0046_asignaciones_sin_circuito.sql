-- Las asignaciones operativas ya se autorizan exclusivamente por
-- fraccionamiento y servicio. La referencia a circuito dejó de tener uso.
ALTER TABLE asignaciones_circuito
  DROP CONSTRAINT IF EXISTS asignaciones_circuito_circuito_id_circuitos_id_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_asignaciones_circuito_usuario;
--> statement-breakpoint
ALTER TABLE asignaciones_circuito
  DROP COLUMN IF EXISTS circuito_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_asignaciones_usuario_activa
  ON asignaciones_circuito (usuario_id, activo);
