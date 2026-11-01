DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'perfiles_servicios_perfil_servicio_unique'
  ) THEN
    ALTER TABLE "perfiles_servicios"
      ADD CONSTRAINT "perfiles_servicios_perfil_servicio_unique"
      UNIQUE ("perfil_id", "fraccionamiento_servicio_id");
  END IF;
END $$;

