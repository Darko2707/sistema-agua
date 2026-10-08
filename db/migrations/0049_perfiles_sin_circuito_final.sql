-- Cada residente pertenece directamente a un fraccionamiento.
ALTER TABLE perfiles_residente
  DROP CONSTRAINT IF EXISTS perfiles_circuito_mismo_fraccionamiento_fk;
--> statement-breakpoint
ALTER TABLE perfiles_residente
  DROP CONSTRAINT IF EXISTS perfiles_residente_circuito_id_circuitos_id_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_perfiles_circuito_estado;
--> statement-breakpoint
ALTER TABLE perfiles_residente
  DROP COLUMN IF EXISTS circuito_id;
