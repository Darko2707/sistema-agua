CREATE INDEX "idx_pagos_perfil_periodo" ON "pagos" USING btree ("perfil_id","mes","anio");--> statement-breakpoint
CREATE INDEX "idx_pagos_creado_en" ON "pagos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "idx_perfiles_circuito_estado" ON "perfiles_residente" USING btree ("circuito_id","estado_agua");