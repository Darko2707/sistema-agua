ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "monto_reconexion" numeric(10, 2) DEFAULT '300.00' NOT NULL;
