INSERT INTO "servicios" ("clave", "nombre", "cobro_mensual", "con_corte_fisico", "activo")
VALUES ('donativo', 'Donativo', false, false, true)
ON CONFLICT ("clave") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "cobro_mensual" = false,
  "con_corte_fisico" = false,
  "activo" = true;
