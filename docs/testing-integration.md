# Pruebas de integración

Las pruebas de integración usan una base PostgreSQL exclusiva. En este proyecto
el pool de aplicación usa Neon Serverless, por lo que `TEST_DATABASE_URL` debe
apuntar a una rama Neon de prueba (o a otro endpoint compatible con Neon Serverless).

1. Crea `.env.test` a partir de `.env.test.example` y configura `TEST_DATABASE_URL`
   con la URL de la rama/base aislada.
2. Ejecuta `npm run test:integration`.

El comando aplica primero todas las migraciones de `db/migrations` usando
`drizzle.test.config.ts` y luego inicia Vitest. El setup de cada worker vuelve a
validar la URL, la compara con `DATABASE_URL` y `DIRECT_URL` y abre el pool de
aplicación con una consulta `select 1` antes de preparar los fixtures.

La validación compara host y nombre de base de datos, ignora credenciales y
parámetros SSL, y normaliza endpoints Neon directos y pooler. Si identifica la
misma base que desarrollo/producción, cancela la ejecución antes de migrar o
escribir datos.
