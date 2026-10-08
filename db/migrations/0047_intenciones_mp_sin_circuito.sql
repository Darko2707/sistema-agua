-- Las intenciones de Mercado Pago se validan y congelan por fraccionamiento.
ALTER TABLE mercado_pago_payment_intents
  DROP CONSTRAINT IF EXISTS mercado_pago_payment_intents_circuito_id_circuitos_id_fk;
--> statement-breakpoint
ALTER TABLE mercado_pago_payment_intents
  DROP COLUMN IF EXISTS circuito_id;
