-- Paso 7: cargos mensuales independientes del agua.

CREATE TYPE "estado_cargo_servicio" AS ENUM ('pendiente', 'pagado', 'cancelado');
--> statement-breakpoint
CREATE TABLE "cargos_servicios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL REFERENCES "fraccionamientos"("id") ON DELETE RESTRICT,
  "perfil_id" uuid NOT NULL REFERENCES "perfiles_residente"("id") ON DELETE RESTRICT,
  "fraccionamiento_servicio_id" uuid NOT NULL REFERENCES "fraccionamiento_servicios"("id") ON DELETE RESTRICT,
  "mes" integer NOT NULL CHECK ("mes" BETWEEN 1 AND 12),
  "anio" integer NOT NULL CHECK ("anio" BETWEEN 2020 AND 2100),
  "monto" numeric(10,2) NOT NULL CHECK ("monto" >= 0),
  "estado" "estado_cargo_servicio" NOT NULL DEFAULT 'pendiente',
  "metodo" "metodo_pago",
  "mercado_pago_payment_id" text,
  "folio" text UNIQUE,
  "creado_en" timestamp NOT NULL DEFAULT now(),
  "pagado_en" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cargos_servicio_periodo"
  ON "cargos_servicios" ("perfil_id", "fraccionamiento_servicio_id", "mes", "anio");
CREATE INDEX "idx_cargos_servicio_tenant_periodo"
  ON "cargos_servicios" ("fraccionamiento_id", "mes", "anio", "estado");
CREATE INDEX "idx_cargos_servicio_perfil_estado"
  ON "cargos_servicios" ("perfil_id", "estado");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_perfiles_residente_tenant_id"
  ON "perfiles_residente" ("id", "fraccionamiento_id");
CREATE UNIQUE INDEX "uq_fraccionamiento_servicios_tenant_id"
  ON "fraccionamiento_servicios" ("id", "fraccionamiento_id");
--> statement-breakpoint
ALTER TABLE "cargos_servicios"
  ADD CONSTRAINT "cargos_servicios_perfil_tenant_fk"
  FOREIGN KEY ("perfil_id", "fraccionamiento_id")
  REFERENCES "perfiles_residente" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
ALTER TABLE "cargos_servicios"
  ADD CONSTRAINT "cargos_servicios_activacion_tenant_fk"
  FOREIGN KEY ("fraccionamiento_servicio_id", "fraccionamiento_id")
  REFERENCES "fraccionamiento_servicios" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_servicios ps
    JOIN fraccionamiento_servicios fs ON fs.id = ps.fraccionamiento_servicio_id
    WHERE ps.fraccionamiento_id <> fs.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0029: no se pueden generar cargos con servicios cruzados entre tenants';
  END IF;
END $$;
