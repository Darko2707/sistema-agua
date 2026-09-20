-- Paso 7: asegurar que las suscripciones de perfil solo apunten a servicios
-- activados en el mismo fraccionamiento.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_servicios ps
    JOIN perfiles_residente p ON p.id = ps.perfil_id
    WHERE ps.fraccionamiento_id <> p.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0028: perfil_servicio mezcla perfil y fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM perfiles_servicios ps
    JOIN fraccionamiento_servicios fs ON fs.id = ps.fraccionamiento_servicio_id
    WHERE ps.fraccionamiento_id <> fs.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0028: perfil_servicio mezcla activacion y fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS uq_fraccionamiento_servicios_id_tenant
  ON fraccionamiento_servicios (id, fraccionamiento_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_servicios_id_tenant
  ON perfiles_servicios (id, fraccionamiento_id);
--> statement-breakpoint

ALTER TABLE perfiles_servicios
  ADD CONSTRAINT perfiles_servicios_perfil_tenant_fk
  FOREIGN KEY (perfil_id, fraccionamiento_id)
  REFERENCES perfiles_residente (id, fraccionamiento_id)
  ON DELETE CASCADE;
ALTER TABLE perfiles_servicios
  ADD CONSTRAINT perfiles_servicios_activacion_tenant_fk
  FOREIGN KEY (fraccionamiento_servicio_id, fraccionamiento_id)
  REFERENCES fraccionamiento_servicios (id, fraccionamiento_id)
  ON DELETE RESTRICT;
