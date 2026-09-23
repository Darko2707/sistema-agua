-- Paso 9 bis: circuitos y asignaciones operativas tenant-safe.

CREATE TYPE "rol_asignacion_circuito" AS ENUM ('cuadrilla_cortes', 'operador_pozo');
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM circuitos c
    WHERE c.fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION '0030: existen circuitos sin fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente p
    WHERE p.fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION '0030: existen perfiles sin fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente p
    JOIN circuitos c ON c.id = p.circuito_id
    WHERE p.fraccionamiento_id IS DISTINCT FROM c.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0030: existen perfiles con circuito de otro fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "circuitos"
  ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
ALTER TABLE "perfiles_residente"
  ALTER COLUMN "fraccionamiento_id" SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_circuitos_tenant_nombre"
  ON "circuitos" ("fraccionamiento_id", "nombre");
CREATE UNIQUE INDEX "uq_circuitos_tenant_id"
  ON "circuitos" ("id", "fraccionamiento_id");
CREATE UNIQUE INDEX "uq_user_tenant_id"
  ON "user" ("id", "fraccionamiento_id");
--> statement-breakpoint

CREATE TABLE "asignaciones_circuito" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "usuario_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "fraccionamiento_id" uuid NOT NULL REFERENCES "fraccionamientos"("id") ON DELETE RESTRICT,
  "circuito_id" uuid NOT NULL REFERENCES "circuitos"("id") ON DELETE CASCADE,
  "fraccionamiento_servicio_id" uuid NOT NULL REFERENCES "fraccionamiento_servicios"("id") ON DELETE RESTRICT,
  "rol" "rol_asignacion_circuito" NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "creado_en" timestamp NOT NULL DEFAULT now(),
  "actualizado_en" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_asignacion_circuito_persona"
  ON "asignaciones_circuito" ("usuario_id", "circuito_id", "fraccionamiento_servicio_id", "rol");
CREATE INDEX "idx_asignaciones_circuito_tenant"
  ON "asignaciones_circuito" ("fraccionamiento_id", "circuito_id", "activo");
CREATE INDEX "idx_asignaciones_circuito_usuario"
  ON "asignaciones_circuito" ("usuario_id", "activo");
--> statement-breakpoint

ALTER TABLE "asignaciones_circuito"
  ADD CONSTRAINT "asignaciones_circuito_usuario_tenant_fk"
  FOREIGN KEY ("usuario_id", "fraccionamiento_id")
  REFERENCES "user" ("id", "fraccionamiento_id")
  ON DELETE CASCADE;
ALTER TABLE "asignaciones_circuito"
  ADD CONSTRAINT "asignaciones_circuito_circuito_tenant_fk"
  FOREIGN KEY ("circuito_id", "fraccionamiento_id")
  REFERENCES "circuitos" ("id", "fraccionamiento_id")
  ON DELETE CASCADE;
ALTER TABLE "asignaciones_circuito"
  ADD CONSTRAINT "asignaciones_circuito_servicio_tenant_fk"
  FOREIGN KEY ("fraccionamiento_servicio_id", "fraccionamiento_id")
  REFERENCES "fraccionamiento_servicios" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "circuitos"
  ADD CONSTRAINT "circuitos_fraccionamiento_nombre_chk"
  CHECK (length(trim("nombre")) BETWEEN 1 AND 120);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM asignaciones_circuito a
    JOIN "user" u ON u.id = a.usuario_id
    WHERE u.role NOT IN ('cuadrilla_cortes', 'operador_pozo')
  ) THEN
    RAISE EXCEPTION '0030: asignación operativa con rol de usuario inválido';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM asignaciones_circuito a
    JOIN fraccionamiento_servicios fs ON fs.id = a.fraccionamiento_servicio_id
    WHERE fs.estado <> 'activo'
  ) THEN
    RAISE EXCEPTION '0030: asignación operativa sobre servicio inactivo';
  END IF;
END $$;
