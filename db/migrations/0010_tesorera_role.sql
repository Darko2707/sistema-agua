ALTER TYPE "rol" ADD VALUE 'tesorera';--> statement-breakpoint
ALTER TABLE "circuitos" ADD COLUMN "tesorera_id" text REFERENCES "user"("id");
