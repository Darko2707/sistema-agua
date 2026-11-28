ALTER TABLE "notas_operativas" ADD COLUMN IF NOT EXISTS "rol_destino" text;
CREATE INDEX IF NOT EXISTS "idx_notas_operativas_fracc_destino" ON "notas_operativas" ("fraccionamiento_id", "rol_destino", "created_at");
