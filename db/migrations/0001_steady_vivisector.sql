CREATE TYPE "public"."estado_agua" AS ENUM('activo', 'pendiente_corte', 'cortado');--> statement-breakpoint
CREATE TYPE "public"."sexo" AS ENUM('masculino', 'femenino', 'otro');--> statement-breakpoint
CREATE TYPE "public"."tenencia" AS ENUM('propietario', 'inquilino');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"expires_at" timestamp,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfiles_residente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"telefono" text NOT NULL,
	"sexo" "sexo" NOT NULL,
	"tenencia" "tenencia" NOT NULL,
	"circuito_id" uuid NOT NULL,
	"edificio" text NOT NULL,
	"departamento" text NOT NULL,
	"estado_agua" "estado_agua" DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp DEFAULT now(),
	CONSTRAINT "perfiles_residente_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "rol" DEFAULT 'residente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "departamentos" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "edificios" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usuarios" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "departamentos" CASCADE;--> statement-breakpoint
DROP TABLE "edificios" CASCADE;--> statement-breakpoint
DROP TABLE "usuarios" CASCADE;--> statement-breakpoint
ALTER TABLE "circuitos" DROP CONSTRAINT "circuitos_representante_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "cortes" DROP CONSTRAINT "cortes_departamento_id_departamentos_id_fk";
--> statement-breakpoint
ALTER TABLE "cortes" DROP CONSTRAINT "cortes_trabajador_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_departamento_id_departamentos_id_fk";
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'residente'::text;--> statement-breakpoint
DROP TYPE "public"."rol";--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'representante', 'operador_pozo', 'cuadrilla_cortes', 'residente');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'residente'::"public"."rol";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."rol" USING "role"::"public"."rol";--> statement-breakpoint
ALTER TABLE "circuitos" ALTER COLUMN "representante_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cortes" ALTER COLUMN "trabajador_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cortes" ADD COLUMN "perfil_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cortes" ADD COLUMN "reconectado_por" text;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "perfil_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "es_reconexion" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfiles_residente" ADD CONSTRAINT "perfiles_residente_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfiles_residente" ADD CONSTRAINT "perfiles_residente_circuito_id_circuitos_id_fk" FOREIGN KEY ("circuito_id") REFERENCES "public"."circuitos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circuitos" ADD CONSTRAINT "circuitos_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_perfil_id_perfiles_residente_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_trabajador_id_user_id_fk" FOREIGN KEY ("trabajador_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" ADD CONSTRAINT "cortes_reconectado_por_user_id_fk" FOREIGN KEY ("reconectado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_perfil_id_perfiles_residente_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles_residente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes" DROP COLUMN "departamento_id";--> statement-breakpoint
ALTER TABLE "pagos" DROP COLUMN "departamento_id";