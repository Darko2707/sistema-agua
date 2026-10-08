-- Cada circuito se convierte en un fraccionamiento independiente.
-- Preflight: no se crea ningun fraccionamiento si la relacion actual ya
-- contiene inconsistencias de tenant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM circuitos WHERE fraccionamiento_id IS NULL) THEN
    RAISE EXCEPTION 'No se puede migrar: existen circuitos sin fraccionamiento origen';
  END IF;

  IF EXISTS (
    SELECT 1 FROM perfiles_residente p
    JOIN circuitos c ON c.id = p.circuito_id
    WHERE p.fraccionamiento_id IS DISTINCT FROM c.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: hay perfiles fuera del fraccionamiento de su circuito';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "user" u
    JOIN perfiles_residente p ON p.user_id = u.id
    WHERE u.role = 'residente'
      AND u.fraccionamiento_id IS DISTINCT FROM p.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: hay residentes con tenant distinto a su perfil';
  END IF;

  -- Solo se puede trasladar un token legacy si ya esta cifrado. Nunca se
  -- copia texto plano entre tenants durante una migracion.
  IF EXISTS (
    SELECT 1 FROM circuitos
    WHERE mercado_pago_access_token IS NOT NULL
      AND btrim(mercado_pago_access_token) <> ''
      AND mercado_pago_access_token !~ '^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$'
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: hay una credencial legacy de Mercado Pago sin cifrar';
  END IF;
END $$;
--> statement-breakpoint
-- Esta fase conserva la tabla `circuitos` solo como mapa histórico de
-- migración; no debe volver a ser usada por la aplicación.

ALTER TABLE "fraccionamientos"
  ADD COLUMN IF NOT EXISTS "representante_id" text REFERENCES "user"("id"),
  ADD COLUMN IF NOT EXISTS "tesorera_id" text REFERENCES "user"("id"),
  ADD COLUMN IF NOT EXISTS "monto_mensual" numeric(10, 2) NOT NULL DEFAULT '50.00',
  ADD COLUMN IF NOT EXISTS "monto_reconexion" numeric(10, 2) NOT NULL DEFAULT '300.00',
  ADD COLUMN IF NOT EXISTS "dia_corte" integer NOT NULL DEFAULT 5;
--> statement-breakpoint

ALTER TABLE "fraccionamientos"
  ADD CONSTRAINT "chk_fraccionamientos_dia_corte"
  CHECK ("dia_corte" BETWEEN 1 AND 28) NOT VALID;
--> statement-breakpoint

ALTER TABLE "fraccionamientos"
  VALIDATE CONSTRAINT "chk_fraccionamientos_dia_corte";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fraccionamientos_representante_unico"
  ON "fraccionamientos" ("representante_id")
  WHERE "representante_id" IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fraccionamientos_tesorera_unica"
  ON "fraccionamientos" ("tesorera_id")
  WHERE "tesorera_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_fraccionamientos_activos_dia_corte"
  ON "fraccionamientos" ("dia_corte")
  WHERE "activo" = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "circuitos_fraccionamientos_migracion" (
  "circuito_id" uuid PRIMARY KEY REFERENCES "circuitos"("id") ON DELETE RESTRICT,
  "fraccionamiento_id" uuid NOT NULL UNIQUE REFERENCES "fraccionamientos"("id") ON DELETE RESTRICT,
  "fraccionamiento_origen_id" uuid REFERENCES "fraccionamientos"("id") ON DELETE SET NULL,
  "preparado_en" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "fraccionamientos" (
  "id", "nombre", "slug", "activo", "representante_id", "tesorera_id",
  "monto_mensual", "monto_reconexion", "dia_corte", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  c."nombre",
  'fracc-' || replace(c."id"::text, '-', ''),
  c."activo",
  c."representante_id",
  c."tesorera_id",
  c."monto_mensual",
  c."monto_reconexion",
  c."dia_corte",
  now(),
  now()
FROM "circuitos" c
WHERE NOT EXISTS (
  SELECT 1 FROM "circuitos_fraccionamientos_migracion" m WHERE m."circuito_id" = c."id"
);
--> statement-breakpoint

INSERT INTO "circuitos_fraccionamientos_migracion" ("circuito_id", "fraccionamiento_id", "fraccionamiento_origen_id")
SELECT c."id", f."id", c."fraccionamiento_id"
FROM "circuitos" c
JOIN "fraccionamientos" f ON f."slug" = 'fracc-' || replace(c."id"::text, '-', '')
ON CONFLICT ("circuito_id") DO NOTHING;
--> statement-breakpoint

-- Replica la configuracion de servicios del fraccionamiento origen para que
-- cada nuevo fraccionamiento mantenga su catalogo operativo.
INSERT INTO "fraccionamiento_servicios" (
  "fraccionamiento_id", "servicio_id", "estado", "monto_mensual", "monto_reconexion", "configuracion", "creado_en", "actualizado_en"
)
SELECT m."fraccionamiento_id", fs."servicio_id", fs."estado", fs."monto_mensual", fs."monto_reconexion", fs."configuracion", now(), now()
FROM "circuitos_fraccionamientos_migracion" m
JOIN "fraccionamiento_servicios" fs ON fs."fraccionamiento_id" = m."fraccionamiento_origen_id"
ON CONFLICT ("fraccionamiento_id", "servicio_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "fraccionamiento_metodos_pago" (
  "fraccionamiento_id", "proveedor", "access_token_cifrado", "collector_id", "activo", "creado_en", "actualizado_en"
)
SELECT
  m."fraccionamiento_id",
  'mercado_pago',
  c."mercado_pago_access_token",
  c."mercado_pago_collector_id",
  true,
  now(),
  now()
FROM "circuitos_fraccionamientos_migracion" m
JOIN "circuitos" c ON c."id" = m."circuito_id"
WHERE c."mercado_pago_access_token" IS NOT NULL
  AND btrim(c."mercado_pago_access_token") <> ''
ON CONFLICT ("fraccionamiento_id", "proveedor") DO UPDATE SET
  "access_token_cifrado" = EXCLUDED."access_token_cifrado",
  "collector_id" = EXCLUDED."collector_id",
  "activo" = true,
  "actualizado_en" = now();
--> statement-breakpoint

-- Una vez que el valor cifrado y el collector estan en el fraccionamiento
-- destino, se elimina la copia legacy del circuito para evitar credenciales
-- compartidas entre los nuevos tenants.
UPDATE "circuitos" c
SET "mercado_pago_access_token" = NULL,
    "mercado_pago_collector_id" = NULL,
    "updated_at" = now()
FROM "circuitos_fraccionamientos_migracion" m
JOIN "fraccionamiento_metodos_pago" mp
  ON mp."fraccionamiento_id" = m."fraccionamiento_id"
 AND mp."proveedor" = 'mercado_pago'
WHERE m."circuito_id" = c."id"
  AND c."mercado_pago_access_token" IS NOT NULL
  AND btrim(c."mercado_pago_access_token") <> ''
  AND mp."access_token_cifrado" = c."mercado_pago_access_token"
  AND mp."collector_id" IS NOT DISTINCT FROM c."mercado_pago_collector_id";
--> statement-breakpoint

INSERT INTO "suscripciones_fraccionamiento" (
  "fraccionamiento_id", "plan", "estado", "vigencia_desde", "vigencia_hasta", "gracia_hasta", "proveedor", "referencia_externa", "creado_en", "actualizado_en"
)
-- El estado se conserva para no interrumpir el servicio, pero una referencia
-- de cobro pertenece al tenant original y no se puede reutilizar.
SELECT m."fraccionamiento_id", s."plan", s."estado", s."vigencia_desde", s."vigencia_hasta", s."gracia_hasta", NULL, NULL, now(), now()
FROM "circuitos_fraccionamientos_migracion" m
JOIN "suscripciones_fraccionamiento" s ON s."fraccionamiento_id" = m."fraccionamiento_origen_id"
  AND s."estado" IN ('activa', 'gracia')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Verificacion posterior: la preparacion debe ser estrictamente uno a uno y
-- toda configuracion de servicio del origen debe existir en el destino.
DO $$
BEGIN
  IF (SELECT count(*) FROM circuitos) <>
     (SELECT count(*) FROM circuitos_fraccionamientos_migracion) THEN
    RAISE EXCEPTION 'La preparacion circuito-fraccionamiento no es uno a uno';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM circuitos_fraccionamientos_migracion m
    JOIN fraccionamiento_servicios origen
      ON origen.fraccionamiento_id = m.fraccionamiento_origen_id
    LEFT JOIN fraccionamiento_servicios destino
      ON destino.fraccionamiento_id = m.fraccionamiento_id
     AND destino.servicio_id = origen.servicio_id
    WHERE destino.id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se pudo copiar toda la configuracion de servicios';
  END IF;
END $$;

-- Los punteros de datos se cambian en la siguiente migración, cuando la
-- aplicación ya no lea ninguna columna ni tabla de circuito. Mantenerlos
-- intactos durante esta fase permite desplegar y validar el mapa sin cortar
-- pagos, perfiles u órdenes de trabajo.
