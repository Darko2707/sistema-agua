ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "responsable_cargos" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- Conserva como responsables a quienes ya tienen vivienda registrada y evita
-- convertir al administrador global o al personal sin vivienda en deudores.
UPDATE "user" AS u
SET "responsable_cargos" = EXISTS (
  SELECT 1
  FROM perfiles_residente AS p
  WHERE p.user_id = u.id
)
WHERE u.deleted_at IS NULL;
