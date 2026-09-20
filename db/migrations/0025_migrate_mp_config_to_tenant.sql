-- Paso 4: consolidar Mercado Pago a nivel de fraccionamiento.
-- Primero se detectan conflictos; solo después se copian valores legacy. Las
-- columnas antiguas se eliminarán en una migración posterior, tras staging.

DO $$
BEGIN
  IF EXISTS (
    SELECT c.fraccionamiento_id
    FROM circuitos c
    WHERE c.mercado_pago_access_token IS NOT NULL
    GROUP BY c.fraccionamiento_id
    HAVING COUNT(DISTINCT c.mercado_pago_access_token) > 1
  ) THEN
    RAISE EXCEPTION '0025: hay credenciales Mercado Pago distintas dentro del mismo fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT c.fraccionamiento_id
    FROM circuitos c
    WHERE c.mercado_pago_collector_id IS NOT NULL
    GROUP BY c.fraccionamiento_id
    HAVING COUNT(DISTINCT c.mercado_pago_collector_id) > 1
  ) THEN
    RAISE EXCEPTION '0025: hay collector_id distintos dentro del mismo fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

INSERT INTO fraccionamiento_metodos_pago
  (fraccionamiento_id, proveedor, access_token_cifrado, collector_id)
SELECT
  c.fraccionamiento_id,
  'mercado_pago',
  MAX(c.mercado_pago_access_token),
  MAX(c.mercado_pago_collector_id)
FROM circuitos c
WHERE c.mercado_pago_access_token IS NOT NULL
GROUP BY c.fraccionamiento_id
ON CONFLICT (fraccionamiento_id, proveedor) DO UPDATE SET
  access_token_cifrado = EXCLUDED.access_token_cifrado,
  collector_id = COALESCE(EXCLUDED.collector_id, fraccionamiento_metodos_pago.collector_id),
  actualizado_en = CURRENT_TIMESTAMP;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM circuitos c
    LEFT JOIN fraccionamiento_metodos_pago m
      ON m.fraccionamiento_id = c.fraccionamiento_id
     AND m.proveedor = 'mercado_pago'
     AND m.activo = true
    WHERE c.mercado_pago_access_token IS NOT NULL
      AND m.id IS NULL
  ) THEN
    RAISE EXCEPTION '0025: quedaron circuitos con configuracion MP sin migrar';
  END IF;
END $$;
