-- trabajador_id should always be set: cortes are created by a cuadrilla member during a physical visit.
-- Remove any cortes with no assigned worker (data integrity cleanup).
DELETE FROM cortes WHERE trabajador_id IS NULL;

ALTER TABLE cortes ALTER COLUMN trabajador_id SET NOT NULL;
