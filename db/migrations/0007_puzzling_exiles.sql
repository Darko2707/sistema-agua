CREATE TYPE "public"."categoria_gasto" AS ENUM('mantenimiento', 'administracion', 'servicios', 'otros');--> statement-breakpoint
CREATE TABLE "gastos_circuito" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circuito_id" uuid NOT NULL,
	"representante_id" text NOT NULL,
	"concepto" text NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"categoria" "categoria_gasto" DEFAULT 'otros' NOT NULL,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"mes" integer NOT NULL,
	"anio" integer NOT NULL,
	"creado_en" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "gastos_circuito" ADD CONSTRAINT "gastos_circuito_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos_circuito" ADD CONSTRAINT "gastos_circuito_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gastos_circuito_periodo" ON "gastos_circuito" USING btree ("circuito_id","mes","anio");