-- Ingresos y gastos ya pertenecen exclusivamente al fraccionamiento.
ALTER TABLE ingresos_adicionales
  DROP CONSTRAINT IF EXISTS ingresos_adicionales_circuito_id_circuitos_id_fk;
--> statement-breakpoint
ALTER TABLE gastos_circuito
  DROP CONSTRAINT IF EXISTS gastos_circuito_circuito_id_circuitos_id_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_ingresos_circuito_periodo;
--> statement-breakpoint
DROP INDEX IF EXISTS idx_gastos_circuito_periodo;
--> statement-breakpoint
ALTER TABLE ingresos_adicionales DROP COLUMN IF EXISTS circuito_id;
--> statement-breakpoint
ALTER TABLE gastos_circuito DROP COLUMN IF EXISTS circuito_id;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingresos_fraccionamiento_periodo ON ingresos_adicionales (fraccionamiento_id, mes, anio);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_gastos_fraccionamiento_periodo ON gastos_circuito (fraccionamiento_id, mes, anio);
