-- Abort instead of coercing unknown legacy payment methods.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pagos
    WHERE metodo IS NOT NULL
      AND metodo::text NOT IN ('efectivo', 'transferencia', 'mercado_pago')
  ) THEN
    RAISE EXCEPTION
      'No se puede crear metodo_pago: existen metodos de pago no reconocidos';
  END IF;
END
$$;
--> statement-breakpoint

-- Some databases may already have received the enum through a manual repair.
-- Accept only the exact shape expected by the application.
DO $$
DECLARE
  existing_labels text[];
BEGIN
  SELECT array_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)
  INTO existing_labels
  FROM pg_type AS enum_type
  JOIN pg_namespace AS enum_namespace ON enum_namespace.oid = enum_type.typnamespace
  JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
  WHERE enum_namespace.nspname = 'public'
    AND enum_type.typname = 'metodo_pago';

  IF existing_labels IS NULL THEN
    CREATE TYPE "public"."metodo_pago"
      AS ENUM ('efectivo', 'transferencia', 'mercado_pago');
  ELSIF existing_labels <> ARRAY['efectivo', 'transferencia', 'mercado_pago']::text[] THEN
    RAISE EXCEPTION
      'No se puede reutilizar metodo_pago: sus valores no coinciden con el schema';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "pagos"
  ALTER COLUMN "metodo" TYPE "public"."metodo_pago"
  USING "metodo"::text::"public"."metodo_pago";
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tickets
    GROUP BY pago_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear uq_tickets_pago_id: existen tickets duplicados por pago';
  END IF;
END
$$;
--> statement-breakpoint

CREATE UNIQUE INDEX "uq_tickets_pago_id"
  ON "tickets" USING btree ("pago_id");
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM reversos_pago
    GROUP BY pago_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede crear uq_reversos_pago_pago_id: existen reversos duplicados por pago';
  END IF;
END
$$;
--> statement-breakpoint

DROP INDEX IF EXISTS "idx_reversos_pago";
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reversos_pago_pago_id"
  ON "reversos_pago" USING btree ("pago_id");
