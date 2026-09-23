-- Paso 16: separar la orden operativa del resultado físico del corte.
-- `cortes` queda como historial de ejecución; esta tabla es la cola y
-- trazabilidad de órdenes de trabajo.

DO $$
BEGIN
  CREATE TYPE "tipo_orden_trabajo" AS ENUM ('corte', 'reconexion');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  CREATE TYPE "estado_orden_trabajo" AS ENUM ('pendiente', 'asignada', 'en_progreso', 'completada', 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE "ordenes_trabajo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fraccionamiento_id" uuid NOT NULL REFERENCES "fraccionamientos"("id") ON DELETE RESTRICT,
  "circuito_id" uuid NOT NULL REFERENCES "circuitos"("id") ON DELETE RESTRICT,
  "perfil_id" uuid NOT NULL REFERENCES "perfiles_residente"("id") ON DELETE RESTRICT,
  "fraccionamiento_servicio_id" uuid NOT NULL REFERENCES "fraccionamiento_servicios"("id") ON DELETE RESTRICT,
  "tipo" "tipo_orden_trabajo" NOT NULL,
  "estado" "estado_orden_trabajo" NOT NULL DEFAULT 'pendiente',
  "trabajador_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "creado_por" text REFERENCES "user"("id") ON DELETE SET NULL,
  "ejecutado_por" text REFERENCES "user"("id") ON DELETE SET NULL,
  "corte_id" uuid REFERENCES "cortes"("id") ON DELETE SET NULL,
  "motivo" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "notas" text,
  "creado_en" timestamp NOT NULL DEFAULT now(),
  "asignado_en" timestamp,
  "iniciado_en" timestamp,
  "completado_en" timestamp,
  "cancelado_en" timestamp,
  "actualizado_en" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Las tres claves compuestas impiden que una orden mezcle tenant, circuito,
-- vivienda o servicio de fraccionamientos distintos.
ALTER TABLE "ordenes_trabajo"
  ADD CONSTRAINT "ordenes_trabajo_perfil_tenant_fk"
  FOREIGN KEY ("perfil_id", "fraccionamiento_id")
  REFERENCES "perfiles_residente" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
ALTER TABLE "ordenes_trabajo"
  ADD CONSTRAINT "ordenes_trabajo_circuito_tenant_fk"
  FOREIGN KEY ("circuito_id", "fraccionamiento_id")
  REFERENCES "circuitos" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
ALTER TABLE "ordenes_trabajo"
  ADD CONSTRAINT "ordenes_trabajo_servicio_tenant_fk"
  FOREIGN KEY ("fraccionamiento_servicio_id", "fraccionamiento_id")
  REFERENCES "fraccionamiento_servicios" ("id", "fraccionamiento_id")
  ON DELETE RESTRICT;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_ordenes_trabajo_idempotency"
  ON "ordenes_trabajo" ("idempotency_key");
CREATE UNIQUE INDEX "uq_ordenes_trabajo_activa"
  ON "ordenes_trabajo" ("perfil_id", "fraccionamiento_servicio_id", "tipo")
  WHERE "estado" IN ('pendiente', 'asignada', 'en_progreso');
CREATE INDEX "idx_ordenes_trabajo_tenant_estado"
  ON "ordenes_trabajo" ("fraccionamiento_id", "estado", "creado_en");
CREATE INDEX "idx_ordenes_trabajo_circuito_estado"
  ON "ordenes_trabajo" ("circuito_id", "estado", "creado_en");
CREATE INDEX "idx_ordenes_trabajo_trabajador_estado"
  ON "ordenes_trabajo" ("trabajador_id", "estado", "creado_en");
CREATE INDEX "idx_ordenes_trabajo_perfil"
  ON "ordenes_trabajo" ("perfil_id", "creado_en");
--> statement-breakpoint

-- Backfill de perfiles que ya estaban pendientes antes de esta migración.
-- Solo se generan órdenes para el servicio de agua con corte físico activo.
INSERT INTO "ordenes_trabajo" (
  "fraccionamiento_id", "circuito_id", "perfil_id", "fraccionamiento_servicio_id",
  "tipo", "estado", "motivo", "idempotency_key"
)
SELECT
  p."fraccionamiento_id",
  p."circuito_id",
  p."id",
  ps."fraccionamiento_servicio_id",
  CASE WHEN p."estado_agua" = 'pendiente_corte' THEN 'corte'::"tipo_orden_trabajo"
       ELSE 'reconexion'::"tipo_orden_trabajo" END,
  'pendiente'::"estado_orden_trabajo",
  CASE WHEN p."estado_agua" = 'pendiente_corte' THEN 'falta_pago' ELSE 'pago_reconexion' END,
  CASE WHEN p."estado_agua" = 'pendiente_corte' THEN 'legacy:corte:' || p."id"::text
       ELSE 'legacy:reconexion:' || p."id"::text END
FROM "perfiles_residente" p
INNER JOIN "perfiles_servicios" ps
  ON ps."perfil_id" = p."id"
 AND ps."fraccionamiento_id" = p."fraccionamiento_id"
 AND ps."activo" = true
INNER JOIN "fraccionamiento_servicios" fs
  ON fs."id" = ps."fraccionamiento_servicio_id"
 AND fs."fraccionamiento_id" = p."fraccionamiento_id"
 AND fs."estado" = 'activo'
INNER JOIN "servicios" s
  ON s."id" = fs."servicio_id"
 AND s."clave" = 'agua'
 AND s."con_corte_fisico" = true
WHERE p."estado_agua" IN ('pendiente_corte', 'pendiente_reconexion')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

ALTER TABLE "ordenes_trabajo"
  ADD CONSTRAINT "ordenes_trabajo_motivo_no_vacio_chk"
  CHECK (length(trim("motivo")) BETWEEN 1 AND 500);
