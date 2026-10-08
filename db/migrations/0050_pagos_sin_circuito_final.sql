-- Los pagos ya se aíslan y validan por fraccionamiento_id.
-- Esta migración se ejecuta después de que la aplicación dejó de leer/escribir
-- pagos.circuito_id, por lo que elimina el último vínculo operativo heredado.

DROP INDEX IF EXISTS "idx_pagos_circuito_periodo";
ALTER TABLE "pagos" DROP CONSTRAINT IF EXISTS "pagos_circuito_id_circuitos_id_fk";
ALTER TABLE "pagos" DROP COLUMN IF EXISTS "circuito_id";
