-- Paso 2: cimientos multi-tenant de SIS4S.
-- Esta migracion es aditiva y debe ejecutarse despues de validar el inventario
-- de datos en staging. No elimina las columnas legacy de circuitos.

ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS 'operador_pozo';
--> statement-breakpoint
CREATE TYPE "public"."estado_suscripcion_fraccionamiento" AS ENUM(
  'activa', 'gracia', 'vencida', 'suspendida', 'cancelada'
);
--> statement-breakpoint
CREATE TYPE "public"."estado_activacion_servicio" AS ENUM('activo', 'inactivo');
--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud_perfil" AS ENUM('pendiente', 'aprobada', 'rechazada');
--> statement-breakpoint

CREATE TABLE "fraccionamientos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "slug" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fraccionamientos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

CREATE TABLE "suscripciones_fraccionamiento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL,
  "plan" text DEFAULT 'anual' NOT NULL,
  "estado" "estado_suscripcion_fraccionamiento" DEFAULT 'activa' NOT NULL,
  "vigencia_desde" timestamp NOT NULL,
  "vigencia_hasta" timestamp NOT NULL,
  "gracia_hasta" timestamp,
  "proveedor" text,
  "referencia_externa" text,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "suscripciones_fraccionamiento_plan_anual_chk" CHECK ("plan" = 'anual'),
  CONSTRAINT "suscripciones_fraccionamiento_fechas_chk" CHECK ("vigencia_hasta" > "vigencia_desde"),
  CONSTRAINT "suscripciones_fraccionamiento_gracia_chk" CHECK ("gracia_hasta" IS NULL OR "gracia_hasta" >= "vigencia_hasta"),
  CONSTRAINT "suscripciones_fraccionamiento_fraccionamiento_id_fk"
    FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX "idx_suscripciones_fraccionamiento_estado"
  ON "suscripciones_fraccionamiento" ("fraccionamiento_id", "estado", "vigencia_hasta");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suscripciones_fraccionamiento_vigente"
  ON "suscripciones_fraccionamiento" ("fraccionamiento_id")
  WHERE "estado" IN ('activa', 'gracia');
--> statement-breakpoint

CREATE TABLE "servicios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clave" text NOT NULL,
  "nombre" text NOT NULL,
  "cobro_mensual" boolean DEFAULT true NOT NULL,
  "con_corte_fisico" boolean DEFAULT false NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  CONSTRAINT "servicios_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE "fraccionamiento_servicios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL,
  "servicio_id" uuid NOT NULL,
  "estado" "estado_activacion_servicio" DEFAULT 'activo' NOT NULL,
  "monto_mensual" numeric(10, 2) NOT NULL,
  "monto_reconexion" numeric(10, 2) DEFAULT 0.00 NOT NULL,
  "configuracion" jsonb,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fraccionamiento_servicios_fraccionamiento_fk"
    FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE cascade,
  CONSTRAINT "fraccionamiento_servicios_servicio_fk"
    FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE restrict,
  CONSTRAINT "fraccionamiento_servicios_montos_chk" CHECK ("monto_mensual" >= 0 AND "monto_reconexion" >= 0),
  CONSTRAINT "fraccionamiento_servicios_unique" UNIQUE("fraccionamiento_id", "servicio_id")
);
--> statement-breakpoint
CREATE INDEX "idx_fraccionamiento_servicios_estado"
  ON "fraccionamiento_servicios" ("fraccionamiento_id", "estado");
--> statement-breakpoint

CREATE TABLE "fraccionamiento_metodos_pago" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL,
  "proveedor" text DEFAULT 'mercado_pago' NOT NULL,
  "access_token_cifrado" text NOT NULL,
  "collector_id" text,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fraccionamiento_metodos_pago_fraccionamiento_fk"
    FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE cascade,
  CONSTRAINT "fraccionamiento_metodos_pago_unique" UNIQUE("fraccionamiento_id", "proveedor")
);
--> statement-breakpoint

CREATE TABLE "perfiles_servicios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "perfil_id" uuid NOT NULL,
  "fraccionamiento_id" uuid NOT NULL,
  "fraccionamiento_servicio_id" uuid NOT NULL,
  "estado_agua" "estado_agua" DEFAULT 'activo' NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp DEFAULT now() NOT NULL,
  "actualizado_en" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "perfiles_servicios_perfil_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE cascade,
  CONSTRAINT "perfiles_servicios_fraccionamiento_fk" FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict,
  CONSTRAINT "perfiles_servicios_activacion_fk" FOREIGN KEY ("fraccionamiento_servicio_id") REFERENCES "public"."fraccionamiento_servicios"("id") ON DELETE restrict,
  CONSTRAINT "perfiles_servicios_unique" UNIQUE("perfil_id", "fraccionamiento_servicio_id")
);
--> statement-breakpoint
CREATE INDEX "idx_perfiles_servicios_tenant_estado" ON "perfiles_servicios" ("fraccionamiento_id", "estado_agua");
CREATE INDEX "idx_perfiles_servicios_perfil" ON "perfiles_servicios" ("perfil_id");
--> statement-breakpoint

CREATE TABLE "solicitudes_cambio_perfil" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "perfil_id" uuid NOT NULL,
  "fraccionamiento_id" uuid NOT NULL,
  "solicitante_id" text NOT NULL,
  "aprobador_id" text,
  "estado" "estado_solicitud_perfil" DEFAULT 'pendiente' NOT NULL,
  "valores_anteriores" jsonb NOT NULL,
  "valores_nuevos" jsonb NOT NULL,
  "motivo" text NOT NULL,
  "solicitado_en" timestamp DEFAULT now() NOT NULL,
  "resuelto_en" timestamp,
  CONSTRAINT "solicitudes_cambio_perfil_perfil_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE cascade,
  CONSTRAINT "solicitudes_cambio_perfil_fraccionamiento_fk" FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict,
  CONSTRAINT "solicitudes_cambio_perfil_solicitante_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."user"("id") ON DELETE restrict,
  CONSTRAINT "solicitudes_cambio_perfil_aprobador_fk" FOREIGN KEY ("aprobador_id") REFERENCES "public"."user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "idx_solicitudes_cambio_perfil_tenant_estado" ON "solicitudes_cambio_perfil" ("fraccionamiento_id", "estado", "solicitado_en");
CREATE INDEX "idx_solicitudes_cambio_perfil_perfil" ON "solicitudes_cambio_perfil" ("perfil_id", "solicitado_en");

--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "perfiles_residente" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "mercado_pago_payment_intents" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "ingresos_adicionales" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint
ALTER TABLE "gastos_circuito" ADD COLUMN "fraccionamiento_id" uuid;
--> statement-breakpoint

-- Tenant inicial para los datos actuales. El UUID fijo permite que el backfill
-- sea idempotente entre staging y produccion.
INSERT INTO "fraccionamientos" ("id", "nombre", "slug")
VALUES ('00000000-0000-4000-8000-000000000004', 'Fraccionamiento 4 Soles', '4-soles')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

UPDATE "circuitos"
SET "fraccionamiento_id" = '00000000-0000-4000-8000-000000000004'
WHERE "fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "perfiles_residente" p
SET "fraccionamiento_id" = c."fraccionamiento_id"
FROM "circuitos" c
WHERE p."circuito_id" = c."id" AND p."fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "pagos" p
SET "fraccionamiento_id" = r."fraccionamiento_id"
FROM "perfiles_residente" r
WHERE p."perfil_id" = r."id" AND p."fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "mercado_pago_payment_intents" i
SET "fraccionamiento_id" = r."fraccionamiento_id"
FROM "perfiles_residente" r
WHERE i."perfil_id" = r."id" AND i."fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "ingresos_adicionales"
SET "fraccionamiento_id" = '00000000-0000-4000-8000-000000000004'
WHERE "fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "gastos_circuito"
SET "fraccionamiento_id" = '00000000-0000-4000-8000-000000000004'
WHERE "fraccionamiento_id" IS NULL;
--> statement-breakpoint
UPDATE "user"
SET "fraccionamiento_id" = '00000000-0000-4000-8000-000000000004'
WHERE "role" <> 'admin' AND "fraccionamiento_id" IS NULL;
--> statement-breakpoint

-- No se permite cerrar el backfill si quedaron filas sin tenant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "circuitos" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "perfiles_residente" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "pagos" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "mercado_pago_payment_intents" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "ingresos_adicionales" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "gastos_circuito" WHERE "fraccionamiento_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "user" WHERE "role" <> 'admin' AND "fraccionamiento_id" IS NULL)
  THEN
    RAISE EXCEPTION '0024: existen filas no administradoras sin fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "circuitos" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "perfiles_residente" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "pagos" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "mercado_pago_payment_intents" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "ingresos_adicionales" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "gastos_circuito" ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "user" ADD CONSTRAINT "user_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "circuitos" ADD CONSTRAINT "circuitos_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "perfiles_residente" ADD CONSTRAINT "perfiles_residente_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "mercado_pago_payment_intents" ADD CONSTRAINT "mp_intents_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "ingresos_adicionales" ADD CONSTRAINT "ingresos_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
ALTER TABLE "gastos_circuito" ADD CONSTRAINT "gastos_fraccionamiento_fk"
  FOREIGN KEY ("fraccionamiento_id") REFERENCES "public"."fraccionamientos"("id") ON DELETE restrict;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_user_single_global_admin" ON "user" ("role")
  WHERE "role" = 'admin' AND "deleted_at" IS NULL;
CREATE INDEX "idx_user_fraccionamiento_role" ON "user" ("fraccionamiento_id", "role");
CREATE INDEX "idx_circuitos_fraccionamiento" ON "circuitos" ("fraccionamiento_id");
CREATE UNIQUE INDEX "uq_circuitos_representante_unico" ON "circuitos" ("representante_id")
  WHERE "representante_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_circuitos_tesorera_unica" ON "circuitos" ("tesorera_id")
  WHERE "tesorera_id" IS NOT NULL;
CREATE INDEX "idx_perfiles_fraccionamiento_circuito" ON "perfiles_residente" ("fraccionamiento_id", "circuito_id");
CREATE INDEX "idx_pagos_fraccionamiento_periodo" ON "pagos" ("fraccionamiento_id", "mes", "anio");
CREATE INDEX "idx_mp_intents_fraccionamiento" ON "mercado_pago_payment_intents" ("fraccionamiento_id", "created_at");
CREATE INDEX "idx_ingresos_fraccionamiento_periodo" ON "ingresos_adicionales" ("fraccionamiento_id", "mes", "anio");
CREATE INDEX "idx_gastos_fraccionamiento_periodo" ON "gastos_circuito" ("fraccionamiento_id", "mes", "anio");
--> statement-breakpoint

INSERT INTO "servicios" ("clave", "nombre", "cobro_mensual", "con_corte_fisico")
VALUES
  ('agua', 'Agua', true, true),
  ('chapeo', 'Chapeo', true, false),
  ('basura', 'Basura', true, false),
  ('vigilancia', 'Vigilancia', true, false)
ON CONFLICT ("clave") DO NOTHING;
--> statement-breakpoint
INSERT INTO "fraccionamiento_servicios" ("fraccionamiento_id", "servicio_id", "monto_mensual", "monto_reconexion")
SELECT f."id", s."id", CASE WHEN s."clave" = 'agua' THEN 50.00 ELSE 0.00 END, CASE WHEN s."clave" = 'agua' THEN 300.00 ELSE 0.00 END
FROM "fraccionamientos" f
JOIN "servicios" s ON s."clave" = 'agua'
WHERE f."slug" = '4-soles'
ON CONFLICT ("fraccionamiento_id", "servicio_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "suscripciones_fraccionamiento"
  ("fraccionamiento_id", "plan", "estado", "vigencia_desde", "vigencia_hasta")
SELECT f."id", 'anual', 'activa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 year'
FROM "fraccionamientos" f
WHERE f."slug" = '4-soles'
  AND NOT EXISTS (
    SELECT 1 FROM "suscripciones_fraccionamiento" s
    WHERE s."fraccionamiento_id" = f."id"
      AND s."estado" IN ('activa', 'gracia')
  );
--> statement-breakpoint
INSERT INTO "perfiles_servicios" ("perfil_id", "fraccionamiento_id", "fraccionamiento_servicio_id", "estado_agua")
SELECT p."id", p."fraccionamiento_id", fs."id", p."estado_agua"
FROM "perfiles_residente" p
JOIN "fraccionamiento_servicios" fs ON fs."fraccionamiento_id" = p."fraccionamiento_id"
JOIN "servicios" s ON s."id" = fs."servicio_id" AND s."clave" = 'agua'
ON CONFLICT ("perfil_id", "fraccionamiento_servicio_id") DO NOTHING;
