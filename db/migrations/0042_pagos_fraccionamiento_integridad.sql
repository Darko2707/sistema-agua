-- SCRUM-19: pagos e intenciones de Mercado Pago quedan aislados de forma
-- obligatoria por fraccionamiento. circuito_id se conserva temporalmente como
-- compatibilidad de registros heredados, pero ya no define el tenant.

UPDATE pagos pago
SET fraccionamiento_id = perfil.fraccionamiento_id
FROM perfiles_residente perfil
WHERE perfil.id = pago.perfil_id
  AND pago.fraccionamiento_id IS DISTINCT FROM perfil.fraccionamiento_id;
--> statement-breakpoint

UPDATE mercado_pago_payment_intents intent
SET fraccionamiento_id = perfil.fraccionamiento_id
FROM perfiles_residente perfil
WHERE perfil.id = intent.perfil_id
  AND intent.fraccionamiento_id IS DISTINCT FROM perfil.fraccionamiento_id;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pagos pago
    LEFT JOIN perfiles_residente perfil ON perfil.id = pago.perfil_id
    WHERE pago.fraccionamiento_id IS NULL
       OR perfil.fraccionamiento_id IS NULL
       OR pago.fraccionamiento_id IS DISTINCT FROM perfil.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION 'No se puede consolidar pagos: existe un pago fuera de su fraccionamiento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mercado_pago_payment_intents intent
    LEFT JOIN perfiles_residente perfil ON perfil.id = intent.perfil_id
    WHERE intent.fraccionamiento_id IS NULL
       OR perfil.fraccionamiento_id IS NULL
       OR intent.fraccionamiento_id IS DISTINCT FROM perfil.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION 'No se puede consolidar intenciones: existe una intencion fuera de su fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE pagos
  ALTER COLUMN fraccionamiento_id SET NOT NULL;
ALTER TABLE mercado_pago_payment_intents
  ALTER COLUMN fraccionamiento_id SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_residente_id_fraccionamiento
  ON perfiles_residente (id, fraccionamiento_id);
--> statement-breakpoint

ALTER TABLE pagos
  DROP CONSTRAINT IF EXISTS pagos_perfil_mismo_fraccionamiento_fk;
ALTER TABLE pagos
  ADD CONSTRAINT pagos_perfil_mismo_fraccionamiento_fk
  FOREIGN KEY (perfil_id, fraccionamiento_id)
  REFERENCES perfiles_residente (id, fraccionamiento_id)
  ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE mercado_pago_payment_intents
  DROP CONSTRAINT IF EXISTS mp_intents_perfil_mismo_fraccionamiento_fk;
ALTER TABLE mercado_pago_payment_intents
  ADD CONSTRAINT mp_intents_perfil_mismo_fraccionamiento_fk
  FOREIGN KEY (perfil_id, fraccionamiento_id)
  REFERENCES perfiles_residente (id, fraccionamiento_id)
  ON DELETE RESTRICT;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pagos_fraccionamiento_periodo
  ON pagos (fraccionamiento_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_mp_payment_intents_fraccionamiento_created
  ON mercado_pago_payment_intents (fraccionamiento_id, created_at);
