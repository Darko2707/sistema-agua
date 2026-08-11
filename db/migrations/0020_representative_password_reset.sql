CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "perfil_id" uuid NOT NULL,
  "representante_id" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_codes_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "password_reset_codes_perfil_id_perfiles_residente_id_fk"
    FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "password_reset_codes_representante_id_user_id_fk"
    FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_codes_user_active"
  ON "password_reset_codes" ("user_id", "expires_at")
  WHERE "used_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_codes_representante"
  ON "password_reset_codes" ("representante_id", "created_at");
