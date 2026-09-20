-- Paso 4: impedir que una fila combine recursos de tenants distintos.
-- Requiere haber aplicado 0024 (columnas y backfill) previamente.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente p
    JOIN circuitos c ON c.id = p.circuito_id
    WHERE p.fraccionamiento_id <> c.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0026: perfiles_residente mezcla circuito y fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pagos p
    JOIN perfiles_residente r ON r.id = p.perfil_id
    WHERE p.fraccionamiento_id <> r.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0026: pagos mezcla perfil y fraccionamiento';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pagos p
    JOIN circuitos c ON c.id = p.circuito_id
    WHERE p.fraccionamiento_id <> c.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0026: pagos mezcla circuito y fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS uq_circuitos_id_fraccionamiento
  ON circuitos (id, fraccionamiento_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_id_fraccionamiento
  ON perfiles_residente (id, fraccionamiento_id);
--> statement-breakpoint

ALTER TABLE perfiles_residente
  ADD CONSTRAINT perfiles_circuito_mismo_fraccionamiento_fk
  FOREIGN KEY (circuito_id, fraccionamiento_id)
  REFERENCES circuitos (id, fraccionamiento_id)
  ON DELETE RESTRICT;
ALTER TABLE pagos
  ADD CONSTRAINT pagos_perfil_mismo_fraccionamiento_fk
  FOREIGN KEY (perfil_id, fraccionamiento_id)
  REFERENCES perfiles_residente (id, fraccionamiento_id)
  ON DELETE RESTRICT;
ALTER TABLE pagos
  ADD CONSTRAINT pagos_circuito_mismo_fraccionamiento_fk
  FOREIGN KEY (circuito_id, fraccionamiento_id)
  REFERENCES circuitos (id, fraccionamiento_id)
  ON DELETE RESTRICT;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM mercado_pago_payment_intents i
    JOIN perfiles_residente p ON p.id = i.perfil_id
    WHERE i.fraccionamiento_id <> p.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION '0026: intenciones Mercado Pago mezclan perfil y fraccionamiento';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE mercado_pago_payment_intents
  ADD CONSTRAINT mp_intent_perfil_mismo_fraccionamiento_fk
  FOREIGN KEY (perfil_id, fraccionamiento_id)
  REFERENCES perfiles_residente (id, fraccionamiento_id)
  ON DELETE RESTRICT;
