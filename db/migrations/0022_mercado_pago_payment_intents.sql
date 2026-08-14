CREATE TABLE "mercado_pago_payment_intents" (
  "external_reference" text PRIMARY KEY NOT NULL,
  "perfil_id" uuid NOT NULL,
  "circuito_id" uuid NOT NULL,
  "periodos" jsonb NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "currency" text DEFAULT 'MXN' NOT NULL,
  "collector_id" text,
  "expires_at" timestamp NOT NULL,
  "mercado_pago_payment_id" text,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chk_mp_payment_intents_external_reference"
    CHECK ("external_reference" ~ '^agua_[a-f0-9]{48}$'),
  CONSTRAINT "chk_mp_payment_intents_currency"
    CHECK ("currency" = 'MXN'),
  CONSTRAINT "chk_mp_payment_intents_total_positive"
    CHECK ("total" > 0),
  CONSTRAINT "chk_mp_payment_intents_periodos_count"
    CHECK (jsonb_typeof("periodos") = 'array' AND jsonb_array_length("periodos") BETWEEN 1 AND 12),
  CONSTRAINT "chk_mp_payment_intents_consumption"
    CHECK (
      ("mercado_pago_payment_id" IS NULL AND "consumed_at" IS NULL)
      OR ("mercado_pago_payment_id" IS NOT NULL AND "consumed_at" IS NOT NULL)
    ),
  CONSTRAINT "mercado_pago_payment_intents_perfil_id_perfiles_residente_id_fk"
    FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "mercado_pago_payment_intents_circuito_id_circuitos_id_fk"
    FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "idx_mp_payment_intents_perfil_created"
  ON "mercado_pago_payment_intents" USING btree ("perfil_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_mp_payment_intents_expires_at"
  ON "mercado_pago_payment_intents" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mp_payment_intents_payment_id"
  ON "mercado_pago_payment_intents" USING btree ("mercado_pago_payment_id")
  WHERE "mercado_pago_payment_id" IS NOT NULL;
