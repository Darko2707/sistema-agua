# Protección perimetral y control de tráfico en Vercel

Actualizado: 2026-08-14.

## Decisión de arquitectura

Vercel debe ser el único reverse proxy público del sistema web. No se recomienda
añadir Nginx delante de Vercel: duplicaría TLS, caché, resolución de IP, reglas y
puntos de fallo sin aportar una identidad de cliente más confiable. El dominio y
sus subdominios públicos deben resolver directamente a Vercel. Railway, si se usa
para procesos internos, no debe publicar una copia del frontend ni un origen HTTP
alternativo que permita eludir el Firewall de Vercel.

El repositorio no contiene Nginx ni un segundo proxy de producción. Aun así, esta
condición debe verificarse en DNS, Vercel y Railway; no puede demostrarse sólo con
el código.

## Capas implementadas en el repositorio

Las defensas se complementan; ninguna sustituye autenticación, autorización ni
validación de inputs.

| Superficie | Red/IP | Cuenta | Límite estructural/concurrencia |
| --- | --- | --- | --- |
| Auth sensible | 30/min | 15/10 min por email HMAC cuando existe | cuerpo medido máximo 32 KiB |
| tRPC | 120/min | 120/min por usuario | 10 operaciones/batch, 256 KiB por POST, 8 solicitudes/IP y 4/usuario |
| Checkout | 5/min | 5/min por residente | la cuenta se consume después de validar sesión |
| Verificación/tickets | 60/min por IP | PDF: 20/10 min | PDF: 2 generaciones concurrentes/usuario |
| Exportaciones | 20/10 min por IP | 6/10 min | 1 exportación concurrente/usuario |
| Reset con representante | buckets separados por fase | buckets separados por email/actor | el estado de solicitud sigue validándose en DB |

Los caps comprueban primero `Content-Length` y además leen de forma acotada un
clon del stream. Por ello también cubren transferencias chunked, longitudes
declaradas menores al body real y clientes que omiten el encabezado. El body
original permanece disponible para Better Auth/tRPC. Los límites superiores de
request de Vercel y WAF siguen siendo defensa adicional; no debe exponerse un
origen alterno que carezca de ellos.

Los valores son defaults conservadores y configurables mediante variables como
`TRPC_IP_RATE_LIMIT`, `TRPC_ACCOUNT_RATE_LIMIT`, `AUTH_ACCOUNT_RATE_LIMIT`,
`REPORT_ACCOUNT_RATE_LIMIT`, `TRPC_MAX_CONCURRENT_REQUESTS`,
`TRPC_MAX_CONCURRENT_IP_REQUESTS` y `REPORT_MAX_CONCURRENT_EXPORTS`. Cambiarlos
requiere observar tráfico real, picos legítimos y falsos positivos.

Las identidades no se guardan en claro en las llaves Redis. Se usa HMAC con
`RATE_LIMIT_KEY_SECRET`; si no existe, se usa `BETTER_AUTH_SECRET`. En producción
la ausencia de ambos es un error de configuración. Cada llave Upstash queda
aislada por proyecto, ambiente (`production`, `preview`, etc.), versión y función:

```text
sistema-agua:<vercel-project-id>:<vercel-env>:v1:<función>
```

Esto evita que auth, checkout, tRPC, reset y reportes compartan accidentalmente
el mismo bucket, y que preview consuma los límites de producción. Las unit tests
no se conectan a Upstash salvo `ALLOW_UPSTASH_TESTS=1` explícito.

La IP se toma primero de `x-vercel-forwarded-for`, que Vercel documenta como su
encabezado canónico. Dentro de Vercel, si falta, la identidad pasa a `anonymous`;
no se confía en `x-forwarded-for` o `x-real-ip` suministrados por el solicitante.
Véase [Request headers de Vercel](https://vercel.com/docs/headers/request-headers).

Los fallos de Upstash son fail-open para no dejar fuera a residentes por una
caída del proveedor. Se emite como máximo un log y un evento Sentry cada cinco
minutos por límite/guard y proceso caliente, con fingerprint estable. Firmas
inválidas repetidas de Mercado Pago se agrupan y muestrean; los conflictos de
pago y errores inesperados se conservan todos para conciliación.

## WAF: configuración pendiente en el dashboard

Vercel recomienda crear primero cada regla con acción `log`, observar tráfico y
sólo después cambiar a `rate limit`, `deny` o `challenge`. La acción de observación
`log` no está disponible para reglas WAF declaradas en `vercel.json`; por ello no
se añadió una falsa configuración al repositorio. Debe hacerse en el dashboard.
Referencia: [WAF Custom Rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules).

Crear reglas independientes, en este orden:

1. `BYPASS-MP-WEBHOOK`: método `POST`, path exacto
   `/api/mercadopago/webhook`, acción `bypass` para reglas personalizadas.
2. `BYPASS-VERCEL-CRONS`: método `GET`, paths exactos bajo `/api/cron/` presentes
   en `vercel.json`, acción `bypass` para reglas personalizadas.
3. `OBS-AUTH`: sólo endpoints `POST` con credenciales (`sign-in/email`,
   `sign-up/email`, solicitud/reset/cambio de contraseña o email). Excluir
   `get-session`, callbacks y `sign-out`.
4. `OBS-CHECKOUT`: `POST /api/mercadopago/checkout`.
5. `OBS-TRPC`: `GET|POST /api/trpc/*`.
6. `OBS-TICKETS`: `/verificar/*`, `/api/tickets/*` y llamadas tRPC de
   `tickets.verificar`.
7. `OBS-REPORTES`: `/api/reportes/*`; las exportaciones tRPC ya quedan incluidas
   en la regla general tRPC y tienen un guard de aplicación adicional.

`bypass` de WAF personalizado no desactiva las mitigaciones DDoS del sistema de
Vercel. Los webhooks siguen obligados a validar firma y los crons su secreto; la
exclusión sólo evita desafíos interactivos que esos agentes no pueden resolver.
Referencia: [acciones y condiciones WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration).

No fijar todavía umbrales productivos en WAF. Mantener las reglas en `log` durante
una ventana que incluya cierres, cobranza y generación masiva de reportes. Luego:

- usar respuesta `429`/rate limit para APIs;
- reservar `challenge` para navegación humana, nunca para webhook o cron;
- usar blacklist/`deny` temporal sólo con evidencia de IP/CIDR abusivo, porque
  agentes distribuidos rotan IP y una lista manual se vuelve deuda operativa;
- revisar falsos positivos por NAT compartido antes de bloquear sólo por IP;
- configurar alertas agregadas por regla/ruta, no una alerta por request.

Vercel ofrece rate limiting WAF en todos los planes. A la fecha de esta revisión,
Hobby permite **1 regla de rate limit por proyecto** y Pro permite **40**. Por
ello, las cinco reglas de rate limit separadas requieren Pro; en Hobby debe
mantenerse una sola regla perimetral prioritaria y confiar en los límites
independientes por ruta/cuenta implementados en la aplicación. Confirmar de nuevo
la cuota antes de activar producción en
[límites oficiales de rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Preview y deployments antiguos

Activar **Standard Protection con Vercel Authentication** en Project Settings →
Deployment Protection. La configuración vigente protege previews y URLs generadas
de deployments, incluidas URLs de producción no canónicas, mientras mantiene
público el dominio productivo. Referencia:
[Deployment Protection](https://vercel.com/docs/deployment-protection).

Para CI/E2E usar un secreto independiente de Protection Bypass for Automation en
el header `x-vercel-protection-bypass`; no hardcodearlo ni reutilizarlo como
`CRON_SECRET`. Sólo cuando un proveedor no admita headers puede ir como query
parameter, y debe rotarse si aparece en logs. Referencia:
[métodos de bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection).

No crear excepciones públicas amplias para `*.vercel.app`. Los webhooks de Mercado
Pago deben apuntar al dominio productivo estable. Los crons de Vercel también deben
usar las rutas productivas. Al retirar una rama o release, comprobar que el
deployment anterior continúa bajo Standard Protection.

## Checklist de activación

- Confirmar plan y número de reglas disponibles.
- Confirmar que DNS sólo expone Vercel y que Railway no ofrece un origen alterno.
- Configurar `RATE_LIMIT_KEY_SECRET` distinto por ambiente (o validar el fallback).
- Verificar `UPSTASH_REDIS_REST_URL/TOKEN` distintos o namespaces visibles por ambiente.
- Activar primero los dos bypass exactos y después las cinco reglas de observación en `log`.
- Observar picos legítimos de auth, cierre, checkout, tickets y reportes.
- Aprobar umbrales, duración de bloqueo, retención y responsables de alertas.
- Promover reglas una por una; probar webhook, cron, login, pago y exportación.
- Activar Standard Protection y probar CI con bypass dedicado.
- Revisar Firewall Overview y Sentry tras 24 horas y después de cada cierre mensual.

No se aplicaron cambios al dashboard, DNS ni infraestructura productiva durante
esta auditoría, porque requieren acceso operativo y aprobación de umbrales.
