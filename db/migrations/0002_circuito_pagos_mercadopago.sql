ALTER TABLE "circuitos" ADD COLUMN "monto_mensual" numeric(10, 2) DEFAULT '50.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "mercado_pago_access_token" text;--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "mercado_pago_collector_id" text;--> statement-breakpoint
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
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "pagos" SET
  "circuito_id" = "perfiles_residente"."circuito_id"
FROM "perfiles_residente"
WHERE "pagos"."perfil_id" = "perfiles_residente"."id";--> statement-breakpoint
UPDATE "pagos" SET
  "representante_id" = "circuitos"."representante_id",
  "mercado_pago_collector_id" = "circuitos"."mercado_pago_collector_id"
FROM "circuitos"
WHERE "pagos"."circuito_id" = "circuitos"."id";--> statement-breakpoint
UPDATE "pagos" SET
  "monto_base" = "monto",
  "iva" = ROUND(("monto" * 0.16)::numeric, 2),
  "comision_mercado_pago" = ROUND((("monto" * 1.16 * 0.0349) + 4)::numeric, 2),
  "retencion_isr" = ROUND(("monto" * 1.16 * 0.025)::numeric, 2),
  "retencion_iva" = ROUND(("monto" * 1.16 * 0.08)::numeric, 2),
  "monto_neto_representante" = ROUND((("monto" * 1.16) - (("monto" * 1.16 * 0.0349) + 4) - ("monto" * 1.16 * 0.025) - ("monto" * 1.16 * 0.08))::numeric, 2),
  "monto" = ROUND(("monto" * 1.16)::numeric, 2);
