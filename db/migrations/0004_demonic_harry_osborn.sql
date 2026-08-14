ALTER TYPE "public"."estado_agua" ADD VALUE IF NOT EXISTS 'pendiente_reconexion';--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "monto_mensual" numeric(10, 2) DEFAULT '50.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "monto_reconexion" numeric(10, 2) DEFAULT '300.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "mercado_pago_access_token" text;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "mercado_pago_collector_id" text;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN IF NOT EXISTS "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "circuito_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "representante_id" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "monto_base" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "iva" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "comision_mercado_pago" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "retencion_isr" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "retencion_iva" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "monto_neto_representante" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "mercado_pago_payment_id" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "mercado_pago_collector_id" text;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'pagos_circuito_id_circuitos_id_fk'
		  AND conrelid = 'public.pagos'::regclass
	) THEN
		ALTER TABLE "pagos" ADD CONSTRAINT "pagos_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'pagos_representante_id_user_id_fk'
		  AND conrelid = 'public.pagos'::regclass
	) THEN
		ALTER TABLE "pagos" ADD CONSTRAINT "pagos_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END
$$;
