-- Paso 14: impedir que un pago de Mercado Pago se acredite dos veces
-- en cargos de servicios distintos.

DO $$
BEGIN
  IF EXISTS (
    SELECT mercado_pago_payment_id
    FROM cargos_servicios
    WHERE mercado_pago_payment_id IS NOT NULL
    GROUP BY mercado_pago_payment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '0033: existen cargos_servicios con el mismo mercado_pago_payment_id';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cargos_servicios_mp_payment_id"
  ON "cargos_servicios" ("mercado_pago_payment_id")
  WHERE "mercado_pago_payment_id" IS NOT NULL;
