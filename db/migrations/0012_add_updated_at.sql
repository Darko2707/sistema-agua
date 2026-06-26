ALTER TABLE "circuitos" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cortes" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;