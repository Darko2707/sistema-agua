# Política de Respaldo

## Base de datos (Neon PostgreSQL)

### Respaldos automáticos (PITR)

Neon ofrece **Point-in-Time Recovery (PITR)** integrado. No requiere configuración adicional.

| Plan       | Retención PITR | Granularidad |
|------------|---------------|--------------|
| Free       | 1 día         | Por segundo  |
| Launch     | 7 días        | Por segundo  |
| Scale      | 30 días       | Por segundo  |
| Business   | 30 días       | Por segundo  |

> El proyecto actualmente está en el plan **Free**. Considera actualizar a **Launch** ($19/mes)
> para obtener 7 días de PITR ante un incidente que no se detecte de inmediato.

### RTO / RPO objetivo

| Métrica | Objetivo  | Notas                                          |
|---------|-----------|------------------------------------------------|
| RPO     | < 1 hora  | Alcanzable con PITR en planes pagados           |
| RTO     | < 2 horas | Tiempo estimado de restauración + verificación  |

---

## Procedimiento de restauración con PITR

### 1. Identificar el punto de restauración

En la consola de Neon (`console.neon.tech`) → tu proyecto → **Branches** → **Restore**,
selecciona la fecha y hora objetivo.

Alternativamente con la CLI:

```bash
# Lista los puntos de restauración disponibles
neonctl branches list --project-id <PROJECT_ID>

# Restaura a un timestamp específico (ISO 8601)
neonctl branches restore main \
  --restore-source-branch main \
  --restore-source-timestamp "2026-01-15T10:00:00Z" \
  --project-id <PROJECT_ID>
```

### 2. Verificar integridad antes de restaurar en producción

```bash
# Crea una rama temporal con el snapshot restaurado
neonctl branches create \
  --name restore-verify \
  --parent main \
  --restore-source-timestamp "2026-01-15T10:00:00Z" \
  --project-id <PROJECT_ID>

# Conéctate y verifica datos críticos
psql "<connection_string_restore_verify>" \
  -c "SELECT count(*) FROM pagos WHERE estado = 'pagado';"
```

### 3. Restaurar producción

Solo si la verificación es satisfactoria:

```bash
neonctl branches restore main \
  --restore-source-branch main \
  --restore-source-timestamp "2026-01-15T10:00:00Z" \
  --project-id <PROJECT_ID>
```

> ⚠️ La restauración reemplaza **todos los datos** desde el punto elegido.
> Coordina con el equipo y pon la app en modo mantenimiento (`MAINTENANCE_MODE=true`)
> antes de proceder.

---

## Modo mantenimiento durante restauración

Agrega esta variable en Vercel y redeploy:

```env
MAINTENANCE_MODE="true"
```

Implementa en el middleware (`middleware.ts`) para redirigir todo el tráfico a `/mantenimiento`.

---

## Archivos (Vercel Blob)

Los PDFs de tickets se almacenan como blobs privados en Vercel Blob, bajo el
prefijo `private-tickets/`. La aplicación guarda identificadores internos, no
URLs públicas, y accede a ellos con `BLOB_READ_WRITE_TOKEN`.

- **Acceso:** los blobs son privados; comprobar un respaldo requiere descargar
  una muestra usando una credencial de servidor autorizada.
- **Respaldo independiente:** la replicación y disponibilidad del proveedor no
  sustituyen un respaldo. Este repositorio todavía no automatiza una exportación
  periódica de Vercel Blob a otro destino.
- **Exportación:** antes de declarar cubiertos los PDFs, implementar y probar un
  proceso que liste y descargue `private-tickets/` mediante la API/SDK de Vercel
  Blob, almacene el snapshot fuera de la cuenta principal y documente su
  restauración. No usar el procedimiento de R2: ese bucket no es el almacenamiento
  activo de esta aplicación.

---

## Redis (Upstash)

Redis se usa exclusivamente para rate limiting. No contiene datos de negocio persistentes.
No requiere política de respaldo — ante pérdida total, el rate limiter simplemente se reinicia.

---

## Checklist mensual de respaldos

- [ ] Verificar que PITR esté activo en la consola de Neon
- [ ] Comprobar el plan de Neon y la retención vigente
- [ ] Ejecutar una restauración de prueba en rama temporal y borrarla
- [ ] Confirmar que los PDFs recientes están accesibles en Vercel Blob y verificar el último snapshot independiente
