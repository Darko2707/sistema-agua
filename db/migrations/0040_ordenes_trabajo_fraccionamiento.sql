-- Las órdenes operativas pertenecen al fraccionamiento. El circuito fue una
-- segmentación previa y no debe condicionar su creación, consulta ni permiso.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ordenes_trabajo
    WHERE fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede retirar circuito_id: existen órdenes sin fraccionamiento';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_ordenes_trabajo_circuito_estado;
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS circuito_id;
