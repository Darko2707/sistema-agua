-- Paso 15: intenciones de Mercado Pago para agua y cargos de servicios.

DO $$
BEGIN
  CREATE TYPE "mercado_pago_intent_tipo" AS ENUM ('agua', 'servicio');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "mercado_pago_payment_intents"
  ADD COLUMN IF NOT EXISTS "tipo" "mercado_pago_intent_tipo" NOT NULL DEFAULT 'agua',
  ADD COLUMN IF NOT EXISTS "cargo_servicio_id" uuid;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cargos_servicios_id_tenant"
  ON "cargos_servicios" ("id", "fraccionamiento_id");
--> statement-breakpoint

ALTER TABLE "mercado_pago_payment_intents"
  ADD CONSTRAINT "mp_intents_cargo_servicio_tenant_fk"
  FOREIGN KEY ("cargo_servicio_id", "fraccionamiento_id")
  REFERENCES "cargos_servicios" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "mercado_pago_payment_intents"
  DROP CONSTRAINT IF EXISTS "chk_mp_payment_intents_external_reference";
ALTER TABLE "mercado_pago_payment_intents"
  ADD CONSTRAINT "chk_mp_payment_intents_external_reference"
  CHECK (
    ("tipo" = 'agua' AND "external_reference" ~ '^agua_[a-f0-9]{48}$' AND "cargo_servicio_id" IS NULL)
    OR
    ("tipo" = 'servicio' AND "external_reference" ~ '^serv_[0-9a-f-]{36}$' AND "cargo_servicio_id" IS NOT NULL)
  );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_mp_payment_intents_cargo_servicio"
  ON "mercado_pago_payment_intents" ("cargo_servicio_id")
  WHERE "cargo_servicio_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_mp_payment_intents_cargo_servicio"
  ON "mercado_pago_payment_intents" ("cargo_servicio_id");
