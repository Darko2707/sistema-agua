-- Paso 19: tickets/recibos para pagos de agua y cargos de servicios.

DO $$
BEGIN
  CREATE TYPE "ticket_tipo" AS ENUM ('agua', 'servicio');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "cargo_servicio_id" uuid,
  ADD COLUMN IF NOT EXISTS "tipo" "ticket_tipo" NOT NULL DEFAULT 'agua';
--> statement-breakpoint

ALTER TABLE "tickets"
  ALTER COLUMN "pago_id" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_cargo_servicio_fk"
  FOREIGN KEY ("cargo_servicio_id")
  REFERENCES "cargos_servicios" ("id")
  ON DELETE RESTRICT;
--> statement-breakpoint

DROP INDEX IF EXISTS "uq_tickets_pago_id";
CREATE UNIQUE INDEX "uq_tickets_pago_id"
  ON "tickets" ("pago_id")
  WHERE "pago_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_tickets_cargo_servicio_id"
  ON "tickets" ("cargo_servicio_id")
  WHERE "cargo_servicio_id" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "tickets"
  ADD CONSTRAINT "chk_ticket_referencia_tipo"
  CHECK (
    ("tipo" = 'agua' AND "pago_id" IS NOT NULL AND "cargo_servicio_id" IS NULL)
    OR
    ("tipo" = 'servicio' AND "pago_id" IS NULL AND "cargo_servicio_id" IS NOT NULL)
  );
