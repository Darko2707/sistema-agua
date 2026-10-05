-- Fase de compatibilidad: cada circuito legado ya tiene un fraccionamiento
-- destino uno a uno (0038). Se mueve el tenant de los datos operativos al
-- destino sin borrar circuito_id, que seguirá disponible hasta SCRUM-9.
-- Drizzle ejecuta cada archivo de migración dentro de una transacción.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM circuitos c
    LEFT JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = c.id
    WHERE m.fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: existe un circuito sin fraccionamiento destino';
  END IF;

  IF EXISTS (
    SELECT 1 FROM perfiles_residente p
    LEFT JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = p.circuito_id
    WHERE m.fraccionamiento_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM pagos p
    LEFT JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = p.circuito_id
    WHERE m.fraccionamiento_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM ordenes_trabajo o
    LEFT JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = o.circuito_id
    WHERE m.fraccionamiento_id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: hay datos operativos sin mapa circuito-fraccionamiento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM perfiles_servicios ps
    JOIN perfiles_residente p ON p.id = ps.perfil_id
    JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = p.circuito_id
    JOIN fraccionamiento_servicios origen ON origen.id = ps.fraccionamiento_servicio_id
    LEFT JOIN fraccionamiento_servicios destino
      ON destino.fraccionamiento_id = m.fraccionamiento_id
     AND destino.servicio_id = origen.servicio_id
    WHERE destino.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM cargos_servicios cs
    JOIN perfiles_residente p ON p.id = cs.perfil_id
    JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = p.circuito_id
    JOIN fraccionamiento_servicios origen ON origen.id = cs.fraccionamiento_servicio_id
    LEFT JOIN fraccionamiento_servicios destino
      ON destino.fraccionamiento_id = m.fraccionamiento_id
     AND destino.servicio_id = origen.servicio_id
    WHERE destino.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM ordenes_trabajo o
    JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = o.circuito_id
    JOIN fraccionamiento_servicios origen ON origen.id = o.fraccionamiento_servicio_id
    LEFT JOIN fraccionamiento_servicios destino
      ON destino.fraccionamiento_id = m.fraccionamiento_id
     AND destino.servicio_id = origen.servicio_id
    WHERE destino.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM asignaciones_circuito a
    JOIN circuitos_fraccionamientos_migracion m ON m.circuito_id = a.circuito_id
    JOIN fraccionamiento_servicios origen ON origen.id = a.fraccionamiento_servicio_id
    LEFT JOIN fraccionamiento_servicios destino
      ON destino.fraccionamiento_id = m.fraccionamiento_id
     AND destino.servicio_id = origen.servicio_id
    WHERE destino.id IS NULL
  ) THEN
    RAISE EXCEPTION 'No se puede migrar: falta el servicio equivalente en el fraccionamiento destino';
  END IF;
END $$;
--> statement-breakpoint

-- Las dos FKs compuestas incluyen fraccionamiento_id. Se recrean al final
-- después de mover ambos lados de la relación al tenant destino.
ALTER TABLE perfiles_residente
  DROP CONSTRAINT IF EXISTS perfiles_circuito_mismo_fraccionamiento_fk;
--> statement-breakpoint
ALTER TABLE asignaciones_circuito
  DROP CONSTRAINT IF EXISTS asignaciones_circuito_circuito_tenant_fk,
  DROP CONSTRAINT IF EXISTS asignaciones_circuito_usuario_tenant_fk;
--> statement-breakpoint

UPDATE perfiles_residente p
SET fraccionamiento_id = m.fraccionamiento_id
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = p.circuito_id
  AND p.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE pagos p
SET fraccionamiento_id = m.fraccionamiento_id
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = p.circuito_id
  AND p.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE mercado_pago_payment_intents i
SET fraccionamiento_id = m.fraccionamiento_id
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = i.circuito_id
  AND i.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE ordenes_trabajo o
SET fraccionamiento_id = m.fraccionamiento_id,
    fraccionamiento_servicio_id = destino.id
FROM circuitos_fraccionamientos_migracion m
, fraccionamiento_servicios origen
, fraccionamiento_servicios destino
WHERE m.circuito_id = o.circuito_id
  AND origen.id = o.fraccionamiento_servicio_id
  AND destino.fraccionamiento_id = m.fraccionamiento_id
  AND destino.servicio_id = origen.servicio_id;
--> statement-breakpoint

UPDATE ingresos_adicionales i
SET fraccionamiento_id = m.fraccionamiento_id
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = i.circuito_id
  AND i.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE gastos_circuito g
SET fraccionamiento_id = m.fraccionamiento_id
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = g.circuito_id
  AND g.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE solicitudes_cambio_perfil s
SET fraccionamiento_id = p.fraccionamiento_id
FROM perfiles_residente p
WHERE p.id = s.perfil_id
  AND s.fraccionamiento_id IS DISTINCT FROM p.fraccionamiento_id;
--> statement-breakpoint

UPDATE perfiles_servicios ps
SET fraccionamiento_id = p.fraccionamiento_id,
    fraccionamiento_servicio_id = destino.id,
    actualizado_en = now()
FROM perfiles_residente p
, fraccionamiento_servicios origen
, fraccionamiento_servicios destino
WHERE p.id = ps.perfil_id
  AND origen.id = ps.fraccionamiento_servicio_id
  AND destino.fraccionamiento_id = p.fraccionamiento_id
  AND destino.servicio_id = origen.servicio_id;
--> statement-breakpoint

UPDATE cargos_servicios cs
SET fraccionamiento_id = p.fraccionamiento_id,
    fraccionamiento_servicio_id = destino.id
FROM perfiles_residente p
, fraccionamiento_servicios origen
, fraccionamiento_servicios destino
WHERE p.id = cs.perfil_id
  AND origen.id = cs.fraccionamiento_servicio_id
  AND destino.fraccionamiento_id = p.fraccionamiento_id
  AND destino.servicio_id = origen.servicio_id;
--> statement-breakpoint

UPDATE asignaciones_circuito a
SET fraccionamiento_id = m.fraccionamiento_id,
    fraccionamiento_servicio_id = destino.id,
    actualizado_en = now()
FROM circuitos_fraccionamientos_migracion m
, fraccionamiento_servicios origen
, fraccionamiento_servicios destino
WHERE m.circuito_id = a.circuito_id
  AND origen.id = a.fraccionamiento_servicio_id
  AND destino.fraccionamiento_id = m.fraccionamiento_id
  AND destino.servicio_id = origen.servicio_id;
--> statement-breakpoint

UPDATE circuitos c
SET fraccionamiento_id = m.fraccionamiento_id,
    updated_at = now()
FROM circuitos_fraccionamientos_migracion m
WHERE m.circuito_id = c.id
  AND c.fraccionamiento_id IS DISTINCT FROM m.fraccionamiento_id;
--> statement-breakpoint

UPDATE "user" u
SET fraccionamiento_id = p.fraccionamiento_id,
    updated_at = now()
FROM perfiles_residente p
WHERE p.user_id = u.id
  AND u.role = 'residente'
  AND u.fraccionamiento_id IS DISTINCT FROM p.fraccionamiento_id;
--> statement-breakpoint

ALTER TABLE perfiles_residente
  ADD CONSTRAINT perfiles_circuito_mismo_fraccionamiento_fk
  FOREIGN KEY (circuito_id, fraccionamiento_id)
  REFERENCES circuitos(id, fraccionamiento_id);
--> statement-breakpoint
ALTER TABLE asignaciones_circuito
  ADD CONSTRAINT asignaciones_circuito_circuito_tenant_fk
  FOREIGN KEY (circuito_id, fraccionamiento_id)
  REFERENCES circuitos(id, fraccionamiento_id),
  ADD CONSTRAINT asignaciones_circuito_usuario_tenant_fk
  FOREIGN KEY (usuario_id, fraccionamiento_id)
  REFERENCES "user"(id, fraccionamiento_id);
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM perfiles_residente p
    JOIN circuitos c ON c.id = p.circuito_id
    WHERE p.fraccionamiento_id IS DISTINCT FROM c.fraccionamiento_id
  ) OR EXISTS (
    SELECT 1
    FROM "user" u
    JOIN perfiles_residente p ON p.user_id = u.id
    WHERE u.role = 'residente'
      AND u.fraccionamiento_id IS DISTINCT FROM p.fraccionamiento_id
  ) THEN
    RAISE EXCEPTION 'La migración dejó perfiles o residentes fuera de su fraccionamiento';
  END IF;
END $$;
