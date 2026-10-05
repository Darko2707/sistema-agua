-- Una vivienda se identifica dentro de su fraccionamiento, no dentro del
-- circuito legado que temporalmente conserva cada perfil.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente
    WHERE fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede consolidar vivienda: existen perfiles sin fraccionamiento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM perfiles_residente
    GROUP BY fraccionamiento_id, edificio, departamento
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede consolidar vivienda: existen viviendas duplicadas por fraccionamiento';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_perfiles_residente_ubicacion;
ALTER TABLE perfiles_residente
  ALTER COLUMN fraccionamiento_id SET NOT NULL;
CREATE UNIQUE INDEX uq_perfiles_residente_ubicacion
  ON perfiles_residente (fraccionamiento_id, edificio, departamento);
CREATE INDEX IF NOT EXISTS idx_perfiles_fraccionamiento_estado
  ON perfiles_residente (fraccionamiento_id, estado_agua);
