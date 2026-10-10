-- El dominio ya opera por fraccionamiento. Conservamos los registros y las
-- relaciones existentes, eliminando únicamente los nombres heredados.
ALTER TYPE IF EXISTS rol_asignacion_circuito RENAME TO rol_asignacion_fraccionamiento;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('asignaciones_circuito') AND relkind IN ('r', 'p')
  ) THEN
    ALTER TABLE asignaciones_circuito RENAME TO asignaciones_fraccionamiento;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('gastos_circuito') AND relkind IN ('r', 'p')
  ) THEN
    ALTER TABLE gastos_circuito RENAME TO gastos_fraccionamiento;
  END IF;
END $$;
--> statement-breakpoint

-- Compatibilidad temporal para funciones de la versión anterior durante el
-- despliegue. Estas vistas simples son actualizables en PostgreSQL.
CREATE OR REPLACE VIEW asignaciones_circuito AS
  SELECT * FROM asignaciones_fraccionamiento;
--> statement-breakpoint
CREATE OR REPLACE VIEW gastos_circuito AS
  SELECT * FROM gastos_fraccionamiento;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asignaciones_circuito_usuario_tenant_fk') THEN
    ALTER TABLE asignaciones_fraccionamiento
      RENAME CONSTRAINT asignaciones_circuito_usuario_tenant_fk
      TO asignaciones_fraccionamiento_usuario_tenant_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asignaciones_circuito_servicio_tenant_fk') THEN
    ALTER TABLE asignaciones_fraccionamiento
      RENAME CONSTRAINT asignaciones_circuito_servicio_tenant_fk
      TO asignaciones_fraccionamiento_servicio_tenant_fk;
  END IF;
END $$;
