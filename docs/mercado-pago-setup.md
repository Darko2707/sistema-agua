# Configuracion de Mercado Pago

Esta aplicacion usa Checkout Pro de Mercado Pago. El pago se acredita solo si
Mercado Pago devuelve un pago `approved` y el webhook llega firmado.

## Variables globales

Configura estas variables en Vercel para el entorno correspondiente:

```env
NEXT_PUBLIC_APP_URL="https://tu-app.vercel.app"
BETTER_AUTH_URL="https://tu-app.vercel.app"
MP_WEBHOOK_SECRET="<clave secreta del webhook de Mercado Pago>"
MP_ENCRYPTION_KEY="<64 caracteres hex>"
```

`MP_ENCRYPTION_KEY` cifra los Access Tokens guardados por circuito. Genera una
clave nueva por entorno y no la cambies si ya hay tokens guardados, porque los
tokens existentes dejarian de descifrarse.

Para generar una clave:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Token por circuito

No uses `MP_ACCESS_TOKEN` como variable global. Cada circuito guarda su propio
Access Token cifrado:

1. Entra como admin.
2. Ve a representantes o tesoreras.
3. Crea o edita la persona asignada al circuito.
4. Captura:
   - `mercadoPagoAccessToken`: `TEST-...` en staging o `APP_USR-...` en produccion.
   - `mercadoPagoCollectorId`: ID de vendedor/collector de esa cuenta.

Si el campo de token se deja vacio al editar, el token actual se conserva.

## Webhook en Mercado Pago

En el panel de Mercado Pago Developers:

1. Abre la app en Tus integraciones.
2. Ve a Webhooks / Configurar notificaciones.
3. Configura:
   - URL de pruebas: `https://staging-url.vercel.app/api/mercadopago/webhook`
   - URL de produccion: `https://produccion.vercel.app/api/mercadopago/webhook`
   - Evento: pagos / payment.
4. Guarda y copia la clave secreta generada.
5. Pega esa clave en `MP_WEBHOOK_SECRET` del mismo entorno.

El codigo valida los headers `x-signature` y `x-request-id` con el SDK oficial.
Si `MP_WEBHOOK_SECRET` falta, el webhook responde `503` para no aceptar pagos
falsos.

## Prueba minima en staging

1. Usa credenciales sandbox (`TEST-...`) y un usuario comprador de prueba.
2. Asegura que el circuito del residente tenga representante y token Mercado Pago.
3. Desde `/residente`, inicia un pago.
4. Completa el pago en Mercado Pago sandbox.
5. Verifica:
   - El regreso termina en `/residente?payment=success`.
   - Se crea pago con metodo `mercado_pago`.
   - Se crea folio/recibo.
   - Se encola una notificacion push de pago confirmado.
   - No hay errores `mp.webhook.*` ni `mp.return.*` en logs/Sentry.

