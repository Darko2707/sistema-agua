ALTER TYPE "public"."rol" ADD VALUE 'tesorera' BEFORE 'cuadrilla_cortes';--> statement-breakpoint
CREATE TABLE "ingresos_adicionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circuito_id" uuid NOT NULL,
	"representante_id" text NOT NULL,
	"concepto" text NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"mes" integer NOT NULL,
	"anio" integer NOT NULL,
	"creado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "tesorera_id" text;--> statement-breakpoint
ALTER TABLE "ingresos_adicionales" ADD CONSTRAINT "ingresos_adicionales_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingresos_adicionales" ADD CONSTRAINT "ingresos_adicionales_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ingresos_circuito_periodo" ON "ingresos_adicionales" USING btree ("circuito_id","mes","anio");--> statement-breakpoint
ALTER TABLE "circuitos" ADD CONSTRAINT "circuitos_tesorera_id_user_id_fk" FOREIGN KEY ("tesorera_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;