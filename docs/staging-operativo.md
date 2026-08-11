# Runbook operativo de staging

Objetivo: validar migraciones, variables reales y flujos criticos sin tocar la
base productiva ni `.env.local`.

## 0. Regla de seguridad

No ejecutes migraciones ni seeds usando `.env.local`. Ese archivo puede apuntar a
una base real. Para staging usa siempre `.env.staging`, que no debe commitearse.

El archivo `.env.staging` debe contener una `DATABASE_URL` de una rama/base
staging separada. Si el host o nombre de rama no te deja claro que es staging,
detente antes de ejecutar comandos.

## 1. Crear o confirmar staging

Necesitas:

- Una URL publica HTTPS de staging en Vercel.
- Una base Neon separada para staging.
- Variables de entorno staging en Vercel.
- Credenciales sandbox de Mercado Pago.

Variables minimas:

```env
DATABASE_URL="postgresql://...staging..."
DIRECT_URL="postgresql://...staging..."
NEXT_PUBLIC_APP_URL="https://tu-staging.vercel.app"
BETTER_AUTH_URL="https://tu-staging.vercel.app"
BETTER_AUTH_SECRET="<secreto staging>"
CRON_SECRET="<secreto staging>"
MP_WEBHOOK_SECRET="<secret webhook sandbox>"
MP_ENCRYPTION_KEY="<64 caracteres hex>"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<clave publica staging>"
VAPID_PRIVATE_KEY="<clave privada staging>"
VAPID_SUBJECT="mailto:correo-real@gmail.com"
```

Mercado Pago no usa `MP_ACCESS_TOKEN` global. El token se captura por circuito
desde el panel admin y se guarda cifrado con `MP_ENCRYPTION_KEY`.

## 2. Generar secretos

Para `BETTER_AUTH_SECRET`, `CRON_SECRET` y `MP_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Para VAPID:

```powershell
npx web-push generate-vapid-keys
```

Guarda la clave publica en `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y la privada en
`VAPID_PRIVATE_KEY`.

## 3. Aplicar migraciones en staging

Primero instala/valida dependencias:

```powershell
npm install
```

Luego ejecuta migraciones apuntando explicitamente a `.env.staging`:

```powershell
npx dotenv -e .env.staging -- drizzle-kit migrate
```

Verificacion minima posterior:

```powershell
npx dotenv -e .env.staging -- drizzle-kit check
```

Si `drizzle-kit check` reporta desalineacion, no sigas con pruebas de pago hasta
resolverla.

## 4. Configurar Mercado Pago sandbox

En Mercado Pago Developers:

1. Abre la app sandbox.
2. Configura webhook de pagos:
   - `https://tu-staging.vercel.app/api/mercadopago/webhook`
3. Copia la clave secreta del webhook a `MP_WEBHOOK_SECRET`.
4. Toma un `Access Token` sandbox (`TEST-...`).
5. En SIS4S, entra como admin y asigna ese token al circuito al crear/editar
   representante o tesorera.

Prueba minima:

1. Inicia sesion como residente de ese circuito.
2. Haz un pago con Mercado Pago sandbox.
3. Confirma que termina en `/residente?payment=success`.
4. Revisa que se cree pago, folio y notificacion push de pago confirmado.

## 5. Seed de datos

El `db/seed.ts` actual solo crea circuitos; no sirve para prueba de capacidad.
Antes de validar 600 usuarios hay que crear un seed dedicado que genere:

- 600 residentes.
- 5-10 circuitos.
- Representantes/tesoreras/cuadrilla.
- 12-36 meses de pagos historicos.
- Morosos, cortados y pendientes de reconexion.
- Notificaciones/outbox suficientes para probar el dispatcher push.

No ejecutes un seed destructivo contra staging sin confirmar que la URL apunta a
la base staging.

## 6. Pruebas de humo

Ejecuta en este orden:

- Registro de residente.
- Restriccion de un solo registro por departamento.
- Recuperacion con codigo de representante.
- Pago Mercado Pago sandbox.
- Descarga de recibo PDF sin QR.
- Push de pago confirmado.
- Aviso previo a corte.
- Corte y reconexion por cuadrilla.
- Reportes de tesorera.
- Health check.

## 7. Produccion

Solo despues de staging verde:

1. Configura variables production en Vercel.
2. Usa credenciales reales de Mercado Pago (`APP_USR-...`) por circuito.
3. Aplica migraciones en produccion en una ventana controlada.
4. Haz un pago real pequeño de prueba y concilialo.
5. Monitorea logs/Sentry/webhooks durante al menos una hora.

