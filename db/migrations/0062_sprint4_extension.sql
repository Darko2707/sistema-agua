ALTER TYPE "categoria_gasto" ADD VALUE IF NOT EXISTS 'insumos';
--> statement-breakpoint
ALTER TABLE "fraccionamientos"
  ADD COLUMN IF NOT EXISTS "tipo_nomenclatura" text NOT NULL DEFAULT 'edificio_depto';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "fraccionamientos" ADD CONSTRAINT "chk_fraccionamientos_tipo_nomenclatura" CHECK ("tipo_nomenclatura" IN ('edificio_depto', 'solo_casa'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "servicios"
  ADD COLUMN IF NOT EXISTS "fraccionamiento_id" uuid REFERENCES "fraccionamientos"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "frecuencia_tipo" text NOT NULL DEFAULT 'mensual',
  ADD COLUMN IF NOT EXISTS "intervalo_periodicidad" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "dia_cobro" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "servicios" ADD CONSTRAINT "chk_servicios_dia_cobro" CHECK ("dia_cobro" BETWEEN 1 AND 31);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "servicios" ADD CONSTRAINT "chk_servicios_frecuencia_tipo" CHECK ("frecuencia_tipo" IN ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual', 'personalizado_dias'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "roles" text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE "asignaciones_fraccionamiento"
  ADD COLUMN IF NOT EXISTS "roles" text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE "perfiles_residente"
  ADD COLUMN IF NOT EXISTS "dueno_perfil_id" uuid,
  ADD COLUMN IF NOT EXISTS "tipo_ocupante" text NOT NULL DEFAULT 'propietario';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "perfiles_residente" ADD CONSTRAINT "chk_perfiles_tipo_ocupante" CHECK ("tipo_ocupante" IN ('propietario', 'inquilino'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "perfiles_residente" ADD CONSTRAINT "fk_perfiles_residente_dueno" FOREIGN KEY ("dueno_perfil_id") REFERENCES "perfiles_residente"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "uq_perfiles_residente_ubicacion";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_perfiles_residente_ubicacion"
  ON "perfiles_residente" ("fraccionamiento_id", "edificio", "departamento")
  WHERE "tipo_ocupante" = 'propietario';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notas_operativas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL REFERENCES "fraccionamientos"("id") ON DELETE CASCADE,
  "autor_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "rol_autor" text NOT NULL,
  "contenido" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notas_operativas_fraccionamiento" ON "notas_operativas" ("fraccionamiento_id", "created_at");
