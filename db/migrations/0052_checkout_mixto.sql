ALTER TYPE mercado_pago_intent_tipo ADD VALUE IF NOT EXISTS 'mixto';

ALTER TABLE mercado_pago_payment_intents
  ADD COLUMN IF NOT EXISTS cargos_servicio_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE mercado_pago_payment_intents
  DROP CONSTRAINT IF EXISTS chk_mp_payment_intents_external_reference;

ALTER TABLE mercado_pago_payment_intents
  ADD CONSTRAINT chk_mp_payment_intents_external_reference CHECK (
    (tipo = 'agua' AND external_reference ~ '^agua_[a-f0-9]{48}$' AND cargo_servicio_id IS NULL AND jsonb_array_length(cargos_servicio_ids) = 0)
    OR (tipo = 'servicio' AND external_reference ~ '^serv_[0-9a-f-]{36}$' AND cargo_servicio_id IS NOT NULL AND jsonb_array_length(cargos_servicio_ids) = 0)
    OR (tipo = 'mixto' AND external_reference ~ '^mix_[a-f0-9]{48}$' AND cargo_servicio_id IS NULL AND (jsonb_array_length(periodos) > 0 OR jsonb_array_length(cargos_servicio_ids) > 0))
  );

ALTER TABLE mercado_pago_payment_intents
  DROP CONSTRAINT IF EXISTS chk_mp_payment_intents_periodos_count;

ALTER TABLE mercado_pago_payment_intents
  ADD CONSTRAINT chk_mp_payment_intents_periodos_count CHECK (
    jsonb_typeof(periodos) = 'array' AND jsonb_array_length(periodos) BETWEEN 0 AND 12
  );
