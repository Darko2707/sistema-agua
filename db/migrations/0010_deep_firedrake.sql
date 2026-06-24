ALTER TABLE "pagos" DROP CONSTRAINT "pagos_representante_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_representante_id_user_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pagos_circuito_periodo" ON "pagos" USING btree ("circuito_id","mes","anio");