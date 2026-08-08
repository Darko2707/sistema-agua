CREATE TYPE "estado_notificacion" AS ENUM ('pendiente', 'enviada', 'fallida');

CREATE TABLE "auditoria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text REFERENCES "user"("id") ON DELETE set null,
  "accion" text NOT NULL,
  "entidad" text NOT NULL,
  "entidad_id" text,
  "detalle" jsonb,
  "ip" text,
  "user_agent" text,
  "creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "reversos_pago" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pago_id" uuid NOT NULL REFERENCES "pagos"("id") ON DELETE restrict,
  "actor_id" text REFERENCES "user"("id") ON DELETE set null,
  "motivo" text NOT NULL,
  "estado_anterior" text NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "consentimientos_legales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "privacidad_version" text NOT NULL,
  "cookies_version" text NOT NULL,
  "terminos_version" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "aceptado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "bitacora_cortes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "corte_id" uuid REFERENCES "cortes"("id") ON DELETE set null,
  "perfil_id" uuid NOT NULL REFERENCES "perfiles_residente"("id") ON DELETE cascade,
  "actor_id" text REFERENCES "user"("id") ON DELETE set null,
  "accion" text NOT NULL,
  "nota" text,
  "foto_url" text,
  "creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "notificaciones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text REFERENCES "user"("id") ON DELETE set null,
  "perfil_id" uuid REFERENCES "perfiles_residente"("id") ON DELETE cascade,
  "canal" text NOT NULL,
  "tipo" text NOT NULL,
  "destino" text NOT NULL,
  "mensaje" text NOT NULL,
  "estado" "estado_notificacion" DEFAULT 'pendiente' NOT NULL,
  "error" text,
  "enviado_en" timestamp,
  "creado_en" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "idx_auditoria_entidad" ON "auditoria" ("entidad", "entidad_id");
CREATE INDEX "idx_auditoria_creado_en" ON "auditoria" ("creado_en");
CREATE INDEX "idx_reversos_pago" ON "reversos_pago" ("pago_id");
CREATE INDEX "idx_reversos_actor" ON "reversos_pago" ("actor_id");
CREATE INDEX "idx_consentimientos_user" ON "consentimientos_legales" ("user_id");
CREATE INDEX "idx_bitacora_cortes_perfil" ON "bitacora_cortes" ("perfil_id");
CREATE INDEX "idx_bitacora_cortes_corte" ON "bitacora_cortes" ("corte_id");
CREATE INDEX "idx_notificaciones_estado" ON "notificaciones" ("estado");
CREATE INDEX "idx_notificaciones_user" ON "notificaciones" ("user_id");
