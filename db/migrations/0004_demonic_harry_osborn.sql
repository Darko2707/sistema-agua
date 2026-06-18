ALTER TYPE "public"."estado_agua" ADD VALUE 'pendiente_reconexion';--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "monto_mensual" numeric(10, 2) DEFAULT '50.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "monto_reconexion" numeric(10, 2) DEFAULT '300.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "mercado_pago_access_token" text;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "mercado_pago_collector_id" text;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "circuito_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "representante_id" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "monto_base" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "iva" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "comision_mercado_pago" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "retencion_isr" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "retencion_iva" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "monto_neto_representante" numeric(10, 2) DEFAULT '0.00';--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "mercado_pago_payment_id" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "mercado_pago_collector_id" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;