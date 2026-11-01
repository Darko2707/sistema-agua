DO $$
BEGIN
  CREATE TYPE "estado_comprobante_transferencia" AS ENUM ('pendiente_validacion', 'aprobado', 'rechazado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "fraccionamientos"
  ADD COLUMN IF NOT EXISTS "banco" text,
  ADD COLUMN IF NOT EXISTS "clabe" text,
  ADD COLUMN IF NOT EXISTS "titular_cuenta" text,
  ADD COLUMN IF NOT EXISTS "numero_cuenta" text,
  ADD COLUMN IF NOT EXISTS "instrucciones_transferencia" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "comprobantes_transferencia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "perfil_id" uuid NOT NULL REFERENCES "perfiles_residente"("id") ON DELETE CASCADE,
  "fraccionamiento_id" uuid NOT NULL REFERENCES "fraccionamientos"("id") ON DELETE RESTRICT,
  "monto" numeric(10, 2) NOT NULL,
  "concepto" text NOT NULL,
  "comprobante_url" text NOT NULL,
  "estado" "estado_comprobante_transferencia" NOT NULL DEFAULT 'pendiente_validacion',
  "motivo_rechazo" text,
  "fecha_emision" timestamp NOT NULL DEFAULT now(),
  "fecha_revision" timestamp,
  "revisado_por" text REFERENCES "user"("id") ON DELETE SET NULL,
  "pago_id" uuid REFERENCES "pagos"("id") ON DELETE SET NULL,
  "metadatos" jsonb,
  "creado_en" timestamp NOT NULL DEFAULT now(),
  "actualizado_en" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comprobantes_transferencia_fracc_estado"
  ON "comprobantes_transferencia" ("fraccionamiento_id", "estado");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comprobantes_transferencia_perfil"
  ON "comprobantes_transferencia" ("perfil_id", "estado");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comprobantes_transferencia_creado_en"
  ON "comprobantes_transferencia" ("creado_en");

