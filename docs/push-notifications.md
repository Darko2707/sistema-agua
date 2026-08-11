# Notificaciones Web Push

El sistema usa Web Push para:

- confirmar pagos;
- avisar antes de que una vivienda pase a corte;
- informar un corte o una reconexion confirmados.

No envia codigos ni avisos por WhatsApp o SMS. Web Push no requiere comprar un
dominio: una URL HTTPS estable de produccion en `*.vercel.app` es suficiente.

## Configuracion VAPID

Genera el par de claves una sola vez, en una terminal privada:

```bash
npx web-push generate-vapid-keys
```

Guarda el resultado como secretos de Vercel. No pegues la clave privada en el
repositorio, tickets, capturas ni registros:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<clave publica>"
VAPID_PRIVATE_KEY="<clave privada>"
VAPID_SUBJECT="mailto:correo-de-contacto@gmail.com"
```

`VAPID_SUBJECT` puede usar un correo real de Gmail u otro proveedor; no exige un
correo con dominio propio. Mantener siempre el mismo par de claves permite que
las suscripciones sigan funcionando entre despliegues.

## Despliegue

1. Configura las tres variables VAPID en Vercel para Production.
2. Usa una unica URL estable de produccion, por ejemplo
   `https://sistema-agua.vercel.app`.
3. Aplica en orden `db/migrations/0018_unique_resident_location.sql` y
   `db/migrations/0019_web_push.sql` en staging; verifica restricciones, tablas
   e indices antes de repetirlo en produccion.
4. Despliega el codigo despues de la migracion.
5. Confirma que `/api/health` responde `ok`.
6. Activa las notificaciones desde el panel de un residente y realiza un pago de
   prueba controlado.
7. Ejecuta manualmente, con `Authorization: Bearer <CRON_SECRET>`, los endpoints
   `/api/cron/avisos-corte` y `/api/cron/notificaciones` en staging.

El despachador reclama trabajos en grupos pequenos, crea una entrega separada por
dispositivo y reintenta fallos temporales. Los valores por defecto preparan hasta
1,000 notificaciones y procesan hasta 2,000 dispositivos por ejecucion con
concurrencia 20, suficiente para una rafaga de 600 residentes incluso si parte de
ellos usa mas de un dispositivo. Se pueden ajustar, sin exceder los topes internos:

```env
PUSH_NOTIFICATION_BATCH_SIZE="1000"
PUSH_DELIVERY_BATCH_SIZE="2000"
PUSH_CONCURRENCY="20"
```

## Compatibilidad y limites

- El permiso se solicita unicamente cuando la persona pulsa **Activar
  notificaciones**.
- En iPhone/iPad (iOS 16.4 o posterior), primero se debe agregar la aplicacion a
  la pantalla de inicio y abrirla desde ese icono.
- Cada navegador o dispositivo se suscribe por separado. Una cuenta puede tener
  varios dispositivos.
- El usuario puede revocar el permiso, estar sin conexion o tener restricciones
  de bateria. Por eso el panel de residente siempre es la fuente oficial del
  estado de pago y servicio.
- Las suscripciones pertenecen al origen HTTPS. Cuando se cambie de la URL
  `*.vercel.app` a un dominio propio, los residentes tendran que activar Web Push
  nuevamente en el nuevo dominio.

## Datos y seguridad

Los endpoints y claves de suscripcion son secretos de capacidad. Permanecen en
`push_subscriptions`, no se incluyen en reportes ni en el panel de operaciones y
nunca deben registrarse en logs. Los avisos de la pantalla bloqueada usan textos
genericos y remiten al usuario autenticado a la aplicacion para ver detalles.
