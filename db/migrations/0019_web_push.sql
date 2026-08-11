-- Web Push replaces the retired WhatsApp delivery channel.
-- Subscriptions are per browser/device; deliveries are tracked independently
-- so a retry for one device cannot duplicate an already successful delivery.

-- Some deployed databases skipped 0004 because its historical journal timestamp
-- was out of order. Keep this repair idempotent for both fresh and existing DBs.
ALTER TYPE "public"."estado_agua"
  ADD VALUE IF NOT EXISTS 'pendiente_reconexion';
--> statement-breakpoint

ALTER TABLE "notificaciones"
  ADD COLUMN "dedupe_key" text,
  ADD COLUMN "expires_at" timestamp;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_notificaciones_dedupe_key"
  ON "notificaciones" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "idx_notificaciones_push_ready"
  ON "notificaciones" USING btree ("creado_en")
  WHERE "estado" = 'pendiente' AND "canal" = 'push';
--> statement-breakpoint

CREATE TABLE "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "endpoint_hash" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "expiration_time" timestamp,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_push_subscriptions_endpoint_hash"
  ON "push_subscriptions" USING btree ("endpoint_hash");
--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user"
  ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE "push_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL REFERENCES "notificaciones"("id") ON DELETE cascade,
  "subscription_id" uuid REFERENCES "push_subscriptions"("id") ON DELETE set null,
  "estado" "estado_notificacion" DEFAULT 'pendiente' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "locked_at" timestamp,
  "last_error" text,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_push_deliveries_notification_subscription"
  ON "push_deliveries" USING btree ("notification_id", "subscription_id");
--> statement-breakpoint
CREATE INDEX "idx_push_deliveries_ready"
  ON "push_deliveries" USING btree ("estado", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "idx_push_deliveries_notification"
  ON "push_deliveries" USING btree ("notification_id");
--> statement-breakpoint
CREATE INDEX "idx_push_deliveries_subscription"
  ON "push_deliveries" USING btree ("subscription_id");
--> statement-breakpoint

-- Keep the historical record, but make it explicit that queued WhatsApp work
-- was intentionally retired and must never be delivered by the new worker.
UPDATE "notificaciones"
SET
  "estado" = 'fallida',
  "error" = 'Canal WhatsApp retirado; mensaje no enviado'
WHERE "canal" = 'whatsapp'
  AND "estado" = 'pendiente';
--> statement-breakpoint

-- 0016 had a non-monotonic journal timestamp in some environments. Re-create
-- its two idempotent indexes here so a fresh production rollout cannot miss them.
CREATE INDEX IF NOT EXISTS "idx_pagos_pendiente_creado"
  ON "pagos" USING btree ("creado_en")
  WHERE "estado" = 'pendiente';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pagos_fecha_pago"
  ON "pagos" USING btree ("fecha_pago");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pagos_mp_payment_id"
  ON "pagos" USING btree ("mercado_pago_payment_id");
--> statement-breakpoint

-- A profile can never have two active physical cuts. Abort the rollout with a
-- clear message if legacy data needs manual reconciliation first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cortes
    WHERE activo = true
    GROUP BY perfil_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear uq_cortes_perfil_activo: existen cortes activos duplicados';
  END IF;
END
$$;
--> statement-breakpoint

DROP INDEX IF EXISTS "idx_cortes_perfil_activo";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cortes_perfil_activo"
  ON "cortes" USING btree ("perfil_id")
  WHERE "activo" = true;
