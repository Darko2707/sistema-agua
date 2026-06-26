# Entorno de Staging

## Estrategia

Usamos **Neon Database Branching** + **Vercel Preview Deployments** para staging.
Cada pull request obtiene un preview URL automático en Vercel; staging "fijo" vive en
la rama `staging` del repo y en la rama `staging` de Neon.

---

## Ramas de base de datos

| Entorno    | Rama Neon    | Propósito                          |
|------------|------------- |------------------------------------|
| Production | `main`       | Datos reales, no tocar directamente |
| Staging    | `staging`    | Espejo de producción con datos falsos |
| PR preview | `preview/pr-<N>` | Se crea y destruye con el PR   |

### Crear rama staging en Neon

```bash
# Instala la CLI de Neon
npm install -g neonctl

# Autentica
neonctl auth

# Crea la rama desde main (snapshot del estado actual)
neonctl branches create --name staging --project-id <PROJECT_ID>

# Obtén la cadena de conexión
neonctl connection-string --branch staging
```

### Crear rama para PR (GitHub Actions opcional)

```yaml
# .github/workflows/preview.yml
- name: Create Neon branch
  uses: neondatabase/create-branch-action@v5
  with:
    project_id: ${{ secrets.NEON_PROJECT_ID }}
    branch_name: preview/pr-${{ github.event.pull_request.number }}
    api_key: ${{ secrets.NEON_API_KEY }}
```

---

## Variables de entorno de staging

Crea un archivo `.env.staging` (no commitear) o configura en Vercel → Settings → Environment Variables
seleccionando el entorno **Preview**.

```env
DATABASE_URL="postgresql://...@ep-staging-branch.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://...@ep-staging-branch.neon.tech/neondb?sslmode=require"
BETTER_AUTH_URL="https://sistema-agua-staging.vercel.app"
NEXT_PUBLIC_APP_URL="https://sistema-agua-staging.vercel.app"

# Mercado Pago — usa credenciales de SANDBOX, no producción
MP_ACCESS_TOKEN="TEST-..."
MP_WEBHOOK_SECRET="..."

# El resto de las variables pueden ser las mismas que producción
# (Redis, Resend, Sentry DSN, etc.)
CRON_SECRET="<otro secreto aleatorio>"
BETTER_AUTH_SECRET="<otro secreto aleatorio>"
```

> **Importante:** Las credenciales de Mercado Pago para staging deben ser del modo
> **sandbox** (`TEST-...`). Obtente en [developers.mercadopago.com](https://developers.mercadopago.com).

---

## Aplicar migraciones en staging

```bash
# Apunta a la DB de staging temporalmente
DATABASE_URL="<staging_url>" npx drizzle-kit migrate
```

---

## Seed de datos de prueba

```bash
# Crea datos sintéticos: circuitos, representantes, residentes, pagos
DATABASE_URL="<staging_url>" npx tsx db/seed.ts
```

---

## Checklist antes de hacer merge a main

- [ ] Migraciones aplicadas en staging sin errores
- [ ] Flujo de registro de residente funcional
- [ ] Flujo de pago MP sandbox (success / pending / failure)
- [ ] Crons ejecutados manualmente (`GET /api/cron/cortes`, `/api/cron/limpiar-pendientes`)
- [ ] Reportes Excel y PDF generados correctamente
- [ ] Sin errores en Sentry staging
