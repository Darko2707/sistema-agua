-- Canonicalize each address before enforcing one resident account per home.
-- The migration aborts instead of merging records when legacy data is
-- ambiguous; payments and water-service history must never be discarded.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente
    WHERE btrim(edificio) !~ '^[0-9]{1,6}$'
       OR btrim(edificio) ~ '^0+$'
       OR btrim(departamento) !~ '^[0-9]{1,6}[A-Za-z]?$'
       OR btrim(departamento) ~ '^0+[A-Za-z]?$'
  ) THEN
    RAISE EXCEPTION
      'No se puede aplicar la unicidad de vivienda: hay edificios o departamentos con formato invalido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        circuito_id,
        regexp_replace(btrim(edificio), '^0+', '') AS edificio_canonico,
        upper(regexp_replace(btrim(departamento), '^0+', '')) AS departamento_canonico
      FROM perfiles_residente
      GROUP BY circuito_id, edificio_canonico, departamento_canonico
      HAVING count(*) > 1
    ) AS duplicados
  ) THEN
    RAISE EXCEPTION
      'No se puede aplicar la unicidad de vivienda: existen departamentos duplicados que requieren revision manual';
  END IF;
END
$$;
--> statement-breakpoint

UPDATE perfiles_residente
SET
  edificio = regexp_replace(btrim(edificio), '^0+', ''),
  departamento = upper(regexp_replace(btrim(departamento), '^0+', ''));
--> statement-breakpoint

ALTER TABLE perfiles_residente
  ADD CONSTRAINT chk_perfiles_edificio_canonico
    CHECK (edificio ~ '^[1-9][0-9]{0,5}$'),
  ADD CONSTRAINT chk_perfiles_departamento_canonico
    CHECK (departamento ~ '^[1-9][0-9]{0,5}[A-Z]?$');
--> statement-breakpoint

CREATE UNIQUE INDEX uq_perfiles_residente_ubicacion
  ON perfiles_residente (circuito_id, edificio, departamento);
