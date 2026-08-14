CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "perfil_id" uuid NOT NULL,
  "requested_at" timestamp DEFAULT now() NOT NULL,
  "generated_at" timestamp,
  "generated_by" text,
  CONSTRAINT "password_reset_requests_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "password_reset_requests_perfil_id_perfiles_residente_id_fk"
    FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "password_reset_requests_generated_by_user_id_fk"
    FOREIGN KEY ("generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "chk_password_reset_requests_generated_by_state"
    CHECK ("generated_at" IS NOT NULL OR "generated_by" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_password_reset_requests_user_pending"
  ON "password_reset_requests" ("user_id")
  WHERE "generated_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_requests_pending_profile"
  ON "password_reset_requests" ("perfil_id", "requested_at")
  WHERE "generated_at" IS NULL;
