# Reparación de la migración 0052: checkout mixto

`0052_checkout_mixto.sql` agrega `mixto` al ENUM
`mercado_pago_intent_tipo` y lo referencia posteriormente en un `CHECK`.
Drizzle Kit 0.31.11 ejecuta las migraciones PostgreSQL pendientes dentro de una
transacción. PostgreSQL exige confirmar el valor ENUM antes de usarlo, por lo
que la migración no puede ser la primera operación que agregue ese valor.

No se modifica `0052`: ya está registrada en `meta/_journal.json` y editar una
migración histórica puede divergir entornos que hayan guardado su hash o su
esquema con una versión anterior.

## Procedimiento controlado

1. Hacer respaldo y usar primero una rama/base aislada de Neon.
2. Ejecutar el preparador con la URL directa del entorno:

   ```powershell
   npx dotenv -e .env.staging -- tsx db/scripts/prepare-checkout-mixto.ts
   ```

   El script ejecuta `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'mixto'` como una
   consulta autónoma, la verifica y no inserta registros de migración.
3. Solo si el script termina en `prepared` o `already-prepared`, ejecutar:

   ```powershell
   npx dotenv -e .env.staging -- drizzle-kit migrate
   ```

4. Verificar que `drizzle.__drizzle_migrations` contenga el timestamp
   `1792108800000`, que exista `cargos_servicio_ids`, y que los CHECK permitan
   `tipo = 'mixto'`.

## Migraciones posteriores

`0053` y `0054` usan `ON CONFLICT`, por lo que su reconciliación puede
repetirse; `0054` sí puede crear cargos pendientes del periodo actual. `0055`
debe probarse contra una copia porque sus renombres dependen de si las tablas
heredadas son tablas o vistas. `0056` agrega una columna idempotentemente, pero
su `UPDATE` recalcula `responsable_cargos`; revisar sus resultados antes de
aplicarlo en producción.
