-- Paso 10: reconciliar perfil_servicio para el servicio base de agua.
-- La operación es idempotente y respeta la activación del servicio por tenant.

INSERT INTO "perfiles_servicios" (
  "perfil_id",
  "fraccionamiento_id",
  "fraccionamiento_servicio_id",
  "estado_agua",
  "activo"
)
SELECT
  p."id",
  p."fraccionamiento_id",
  fs."id",
  p."estado_agua",
  true
FROM "perfiles_residente" p
JOIN "fraccionamiento_servicios" fs
  ON fs."fraccionamiento_id" = p."fraccionamiento_id"
JOIN "servicios" s
  ON s."id" = fs."servicio_id"
WHERE s."clave" = 'agua'
  AND s."activo" = true
  AND fs."estado" = 'activo'
ON CONFLICT ("perfil_id", "fraccionamiento_servicio_id") DO UPDATE
SET "activo" = true,
    "estado_agua" = EXCLUDED."estado_agua",
    "actualizado_en" = CURRENT_TIMESTAMP;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "perfiles_residente" p
    JOIN "fraccionamiento_servicios" fs
      ON fs."fraccionamiento_id" = p."fraccionamiento_id"
    JOIN "servicios" s
      ON s."id" = fs."servicio_id"
    WHERE s."clave" = 'agua'
      AND s."activo" = true
      AND fs."estado" = 'activo'
      AND NOT EXISTS (
        SELECT 1
        FROM "perfiles_servicios" ps
        WHERE ps."perfil_id" = p."id"
          AND ps."fraccionamiento_id" = p."fraccionamiento_id"
          AND ps."fraccionamiento_servicio_id" = fs."id"
      )
  ) THEN
    RAISE EXCEPTION '0031: existen residentes sin perfil_servicio de agua';
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_perfiles_servicios_activo_tenant"
  ON "perfiles_servicios" ("fraccionamiento_id", "activo", "fraccionamiento_servicio_id");
