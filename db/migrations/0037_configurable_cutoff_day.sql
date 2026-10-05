-- Día de corte configurable por circuito. Se limita a 1..28 para que exista
-- en todos los meses y los cron diarios puedan ejecutarse de forma uniforme.

ALTER TABLE "circuitos"
  ADD COLUMN IF NOT EXISTS "dia_corte" integer;
--> statement-breakpoint

UPDATE "circuitos"
SET "dia_corte" = 5
WHERE "dia_corte" IS NULL;
--> statement-breakpoint

ALTER TABLE "circuitos"
  ALTER COLUMN "dia_corte" SET DEFAULT 5,
  ALTER COLUMN "dia_corte" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "circuitos"
    ADD CONSTRAINT "chk_circuitos_dia_corte"
    CHECK ("dia_corte" BETWEEN 1 AND 28) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_circuitos_activos_dia_corte
  ON circuitos (dia_corte)
  WHERE activo = true;
--> statement-breakpoint

ALTER TABLE "circuitos"
  VALIDATE CONSTRAINT "chk_circuitos_dia_corte";
