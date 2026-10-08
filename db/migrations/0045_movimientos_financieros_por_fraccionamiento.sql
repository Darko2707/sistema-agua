-- Los ingresos y gastos se registran directamente en el fraccionamiento.
-- circuito_id queda opcional exclusivamente para conservar historial legado.
ALTER TABLE ingresos_adicionales
  ALTER COLUMN circuito_id DROP NOT NULL;
ALTER TABLE gastos_circuito
  ALTER COLUMN circuito_id DROP NOT NULL;

ALTER TABLE ingresos_adicionales
  DROP CONSTRAINT IF EXISTS ingresos_adicionales_circuito_id_circuitos_id_fk;
ALTER TABLE gastos_circuito
  DROP CONSTRAINT IF EXISTS gastos_circuito_circuito_id_circuitos_id_fk;

ALTER TABLE ingresos_adicionales
  ADD CONSTRAINT ingresos_adicionales_circuito_id_circuitos_id_fk
  FOREIGN KEY (circuito_id) REFERENCES circuitos(id) ON DELETE SET NULL;
ALTER TABLE gastos_circuito
  ADD CONSTRAINT gastos_circuito_circuito_id_circuitos_id_fk
  FOREIGN KEY (circuito_id) REFERENCES circuitos(id) ON DELETE SET NULL;
