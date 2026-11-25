ALTER TABLE "fraccionamientos"
  ADD COLUMN IF NOT EXISTS "limite_viviendas" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "esquema_tarifa" text NOT NULL DEFAULT 'sencillo';
--> statement-breakpoint
UPDATE "servicios"
  SET "nombre" = 'Mantenimiento de bomba'
  WHERE "clave" = 'agua';
