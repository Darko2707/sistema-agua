-- Cron limpiar-pendientes: evita full-scan al marcar pagos pendientes vencidos.
CREATE INDEX IF NOT EXISTS "idx_pagos_pendiente_creado"
  ON "pagos" USING btree ("creado_en")
  WHERE estado = 'pendiente';
--> statement-breakpoint

-- Dashboard de métricas y ordenamiento en reportes de pagos pagados.
CREATE INDEX IF NOT EXISTS "idx_pagos_fecha_pago"
  ON "pagos" USING btree ("fecha_pago");
