ALTER TABLE "gastos_fraccionamiento"
  ADD COLUMN "idempotency_key" text,
  ADD COLUMN "referencia" text,
  ADD COLUMN "anulada_en" timestamp,
  ADD COLUMN "anulada_por" text REFERENCES "user"("id") ON DELETE SET NULL,
  ADD COLUMN "motivo_anulacion" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gastos_idempotency_tenant"
  ON "gastos_fraccionamiento" ("fraccionamiento_id", "idempotency_key");
