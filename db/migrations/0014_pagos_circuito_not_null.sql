-- Backfill circuito_id from the resident's profile where it is missing
UPDATE pagos p
SET    circuito_id = pr.circuito_id
FROM   perfiles_residente pr
WHERE  p.perfil_id = pr.id
  AND  p.circuito_id IS NULL;

-- Remove any payments whose resident profile no longer exists (true orphans)
DELETE FROM pagos WHERE circuito_id IS NULL;

ALTER TABLE pagos ALTER COLUMN circuito_id SET NOT NULL;
