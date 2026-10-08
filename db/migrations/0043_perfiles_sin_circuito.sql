-- Los nuevos registros pertenecen al fraccionamiento. circuito_id queda solo
-- como referencia historica mientras se completa la eliminacion de circuitos.
ALTER TABLE "perfiles_residente"
  ALTER COLUMN "circuito_id" DROP NOT NULL;

ALTER TABLE "pagos"
  ALTER COLUMN "circuito_id" DROP NOT NULL;

ALTER TABLE "mercado_pago_payment_intents"
  ALTER COLUMN "circuito_id" DROP NOT NULL;
