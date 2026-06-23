CREATE TABLE "ingresos_adicionales" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "circuito_id"      uuid    NOT NULL REFERENCES "circuitos"("id") ON DELETE CASCADE,
  "representante_id" text    NOT NULL REFERENCES "user"("id"),
  "concepto"         text    NOT NULL,
  "monto"            numeric(10,2) NOT NULL,
  "fecha"            timestamp NOT NULL DEFAULT now(),
  "mes"              integer NOT NULL,
  "anio"             integer NOT NULL,
  "creado_en"        timestamp DEFAULT now()
);

CREATE INDEX "idx_ingresos_circuito_periodo" ON "ingresos_adicionales" ("circuito_id", "mes", "anio");
