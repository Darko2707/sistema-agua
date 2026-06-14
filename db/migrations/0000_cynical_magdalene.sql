CREATE TYPE "public"."estado_pago" AS ENUM('pendiente', 'pagado', 'vencido');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'representante', 'trabajador', 'residente');--> statement-breakpoint
CREATE TABLE "circuitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"representante_id" uuid
);
--> statement-breakpoint
CREATE TABLE "cortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departamento_id" uuid NOT NULL,
	"trabajador_id" uuid,
	"motivo" text NOT NULL,
	"activo" boolean DEFAULT true,
	"fecha_corte" timestamp DEFAULT now(),
	"fecha_reconexion" timestamp
);
--> statement-breakpoint
CREATE TABLE "departamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edificio_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"residente_id" uuid,
	"estado_agua" text DEFAULT 'activo'
);
--> statement-breakpoint
CREATE TABLE "edificios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circuito_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"direccion" text
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departamento_id" uuid NOT NULL,
	"mes" integer NOT NULL,
	"anio" integer NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"estado" "estado_pago" DEFAULT 'pendiente',
	"metodo" text,
	"folio" text,
	"fecha_pago" timestamp,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "pagos_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pago_id" uuid NOT NULL,
	"folio" text NOT NULL,
	"qr_code" text,
	"pdf_url" text,
	"emitido_en" timestamp DEFAULT now(),
	CONSTRAINT "tickets_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"rol" "rol" DEFAULT 'residente' NOT NULL,
	"activo" boolean DEFAULT true,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "circuitos" ADD CONSTRAINT "circuitos_representante_id_usuarios_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_trabajador_id_usuarios_id_fk" FOREIGN KEY ("trabajador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_edificio_id_edificios_id_fk" FOREIGN KEY ("edificio_id") REFERENCES "public"."edificios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departamentos" ADD CONSTRAINT "departamentos_residente_id_usuarios_id_fk" FOREIGN KEY ("residente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edificios" ADD CONSTRAINT "edificios_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_departamento_id_departamentos_id_fk" FOREIGN KEY ("departamento_id") REFERENCES "public"."departamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE no action ON UPDATE no action;