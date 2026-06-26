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

## Archivos (Cloudflare R2)

Los PDFs de tickets se almacenan en R2 con el bucket `tickets-agua`.

- **Retención:** R2 no tiene expiración automática — los archivos persisten indefinidamente.
- **Respaldo:** R2 replica datos internamente en múltiples ubicaciones (99.999999999% durabilidad).
- **Exportación manual:** Si se requiere un snapshot completo del bucket:

```bash
# Instala rclone y configura con las credenciales R2
rclone sync r2:tickets-agua ./backup-r2-$(date +%Y%m%d)
```

---

## Redis (Upstash)

Redis se usa exclusivamente para rate limiting. No contiene datos de negocio persistentes.
No requiere política de respaldo — ante pérdida total, el rate limiter simplemente se reinicia.

---

## Checklist mensual de respaldos

- [ ] Verificar que PITR esté activo en la consola de Neon
- [ ] Comprobar el plan de Neon y la retención vigente
- [ ] Ejecutar una restauración de prueba en rama temporal y borrarla
- [ ] Confirmar que los PDFs de tickets recientes están accesibles en R2
