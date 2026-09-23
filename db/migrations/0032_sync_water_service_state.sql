-- Paso 11: mantener sincronizado el estado de agua durante la transición.
-- perfiles_servicios será la fuente final; por ahora se conservan ambas
-- columnas para que los flujos legacy sigan funcionando sin divergencias.

UPDATE "perfiles_servicios" ps
SET "estado_agua" = p."estado_agua",
    "actualizado_en" = CURRENT_TIMESTAMP
FROM "perfiles_residente" p,
     "fraccionamiento_servicios" fs,
     "servicios" s
WHERE ps."perfil_id" = p."id"
  AND ps."fraccionamiento_id" = p."fraccionamiento_id"
  AND fs."id" = ps."fraccionamiento_servicio_id"
  AND s."id" = fs."servicio_id"
  AND s."clave" = 'agua';
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "perfiles_servicios" ps
    JOIN "perfiles_residente" p ON p."id" = ps."perfil_id"
    JOIN "fraccionamiento_servicios" fs ON fs."id" = ps."fraccionamiento_servicio_id"
    JOIN "servicios" s ON s."id" = fs."servicio_id"
    WHERE s."clave" = 'agua'
      AND (ps."fraccionamiento_id" <> p."fraccionamiento_id"
        OR ps."estado_agua" <> p."estado_agua")
  ) THEN
    RAISE EXCEPTION '0032: estados de agua no reconciliados';
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sync_water_state_from_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "perfiles_servicios" ps
  SET "estado_agua" = NEW."estado_agua",
      "actualizado_en" = CURRENT_TIMESTAMP
  FROM "fraccionamiento_servicios" fs
  JOIN "servicios" s ON s."id" = fs."servicio_id"
  WHERE ps."perfil_id" = NEW."id"
    AND ps."fraccionamiento_id" = NEW."fraccionamiento_id"
    AND ps."fraccionamiento_servicio_id" = fs."id"
    AND s."clave" = 'agua'
    AND ps."estado_agua" IS DISTINCT FROM NEW."estado_agua";
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sync_water_state_from_service_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "perfiles_residente" p
  SET "estado_agua" = NEW."estado_agua"
  FROM "fraccionamiento_servicios" fs
  JOIN "servicios" s ON s."id" = fs."servicio_id"
  WHERE p."id" = NEW."perfil_id"
    AND p."fraccionamiento_id" = NEW."fraccionamiento_id"
    AND fs."id" = NEW."fraccionamiento_servicio_id"
    AND s."clave" = 'agua'
    AND p."estado_agua" IS DISTINCT FROM NEW."estado_agua";
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_sync_water_state_from_profile ON "perfiles_residente";
CREATE TRIGGER trg_sync_water_state_from_profile
AFTER UPDATE OF "estado_agua" ON "perfiles_residente"
FOR EACH ROW
WHEN (OLD."estado_agua" IS DISTINCT FROM NEW."estado_agua")
EXECUTE FUNCTION sync_water_state_from_profile();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_sync_water_state_from_service_profile ON "perfiles_servicios";
CREATE TRIGGER trg_sync_water_state_from_service_profile
AFTER UPDATE OF "estado_agua" ON "perfiles_servicios"
FOR EACH ROW
WHEN (OLD."estado_agua" IS DISTINCT FROM NEW."estado_agua")
EXECUTE FUNCTION sync_water_state_from_service_profile();
