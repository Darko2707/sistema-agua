# Pendientes y errores detectados - SIS4S

Actualizado: 2026-08-22.

Este documento consolida los pendientes funcionales y operativos detectados para
revisarlos, priorizarlos y corregirlos sin perder contexto. Cada punto incluye el
resultado esperado para poder probarlo en staging antes de pasarlo a produccion.

## Prioridad alta

### P-001 - Recordar usuario en inicio de sesion

**Area:** Autenticacion y sesion.

**Estado:** corregido en codigo y cubierto por pruebas unitarias; pendiente de
prueba manual en staging/navegador.

**Problema:** la opcion "Recordar usuario" no estaria conservando el correo o no
lo muestra automaticamente al volver a iniciar sesion.

**Resultado esperado:**

- Al marcar "Recordar usuario" y acceder correctamente, el sistema guarda solo el
  correo electronico normalizado.
- Al cerrar sesion o volver despues, el campo de correo aparece precargado.
- La casilla aparece marcada si hay correo recordado.
- Al desmarcar la casilla, el correo recordado se elimina.
- Nunca se guarda contrasena, token ni sesion.

**Pruebas sugeridas:**

- Login exitoso con la casilla marcada.
- Cierre de sesion y regreso a `/login`.
- Desmarcar y confirmar que ya no precarga el correo.
- Probar en navegador normal y en ventana privada.

### P-002 - Codigo de recuperacion visible para representante

**Area:** Autenticacion y recuperacion de contrasena.

**Estado:** corregido en codigo; requiere migracion `0023` aplicada en staging
antes de probar con usuarios reales.

**Problema:** al representante no le aparece la opcion para generar codigo de
recuperacion.

**Resultado esperado:**

- El residente solicita recuperacion desde la pantalla de recuperacion.
- El representante de ese circuito ve la solicitud pendiente.
- El boton para generar codigo aparece solo si existe solicitud pendiente.
- Despues de generar el codigo, el boton desaparece.
- El boton vuelve a aparecer solo si el residente solicita otro codigo.
- El codigo contiene exactamente 6 digitos y se muestra sin espacios.

**Pruebas sugeridas:**

- Solicitud con residente del circuito del representante.
- Solicitud con residente de otro circuito, que no debe aparecer.
- Generar codigo una sola vez por solicitud.
- Usar el codigo y comprobar que la solicitud queda cerrada.

### P-003 - Telefono exacto de 10 digitos en registro

**Area:** Validaciones de formulario.

**Estado:** corregido en frontend y backend.

**Problema:** el campo telefono debe aceptar unicamente numeros y exactamente 10
digitos.

**Resultado esperado:**

- No permite letras, espacios ni simbolos.
- No permite menos de 10 digitos.
- No permite mas de 10 digitos.
- Muestra un mensaje claro: "El telefono debe contener exactamente 10 digitos".
- La misma regla debe existir en frontend y backend.
- Si el residente es inquilino, el telefono del propietario debe seguir la misma
  regla si se captura.

**Pruebas sugeridas:**

- `2281234567` valido.
- `228123456` invalido.
- `22812345678` invalido.
- `228 123 4567` invalido.
- `228abc4567` invalido.
- `+522281234567` invalido.

### P-004 - Error al pagar con residente recien registrado

**Area:** Autenticacion, CSP, Mercado Pago y experiencia de error.

**Estado:** mitigado en codigo y pendiente de diagnostico final en staging con
navegador real.

**Problema:** al pagar con Mercado Pago usando un residente nuevo aparecen errores
relacionados con CSP, Vercel Live y `/api/auth/sign-in/email`.

**Resultado esperado:**

- El login del residente nuevo no se rompe.
- La creacion de la preferencia de pago no falla por CSP.
- La redireccion a Mercado Pago funciona.
- El retorno desde Mercado Pago no muestra errores tecnicos al usuario.
- El webhook registra el pago aprobado.
- Los errores tecnicos quedan en logs/Sentry y la UI muestra un mensaje claro.
- CSP permite Vercel Live en desarrollo/preview para que sus scripts no rompan
  la pantalla de pago en staging.

**Pruebas sugeridas:**

- Crear residente nuevo en staging.
- Iniciar sesion con ese residente.
- Pagar 1 mes.
- Pagar 12 meses con tarjeta de prueba.
- Revisar consola del navegador, Network, logs de Vercel y Sentry.
- Confirmar si el error de Vercel Live ocurre solo en preview/staging o tambien
  en produccion.

### P-005 - Pagos atrasados y captura de ultimos 12 meses

**Area:** Pagos y adeudos.

**Estado:** corregido para flujo de tesorera; pendiente validar regla contable
de inicio real de deuda.

**Problema:** la tesorera debe poder ver y registrar como minimo los ultimos 12
meses para capturar pagos hechos antes de usar el sistema.

**Resultado esperado:**

- La seccion "Registrar pagos" muestra meses atrasados, mes actual y meses
  adelantados.
- Los meses ya pagados aparecen bloqueados.
- Se pueden pagar de 1 a 12 meses por registro.
- La ventana muestra al menos los ultimos 12 meses para captura historica, sin
  convertir automaticamente esos meses en adeudo obligatorio si son anteriores a
  la fecha de alta.
- Los adeudos no desaparecen con el paso del tiempo.
- Un adeudo puede pagarse meses despues.
- El perfil o estado de cuenta muestra los adeudos; el cobro se hace desde
  "Registrar pagos".

**Decision pendiente:**

- Definir desde que mes empieza la deuda real de un residente: fecha de registro,
  fecha de alta de servicio, importacion historica o una fecha configurada por el
  administrador.

### P-006 - Desglose correcto en comprobantes de tarjeta

**Area:** Recibos, Mercado Pago y reportes financieros.

**Estado:** corregido en generacion de PDF; pendiente prueba visual con un pago
real de Mercado Pago en staging.

**Problema:** el comprobante individual debe mostrar claramente cuota del
circuito, comision/cargo por tarjeta y total final pagado.

**Resultado esperado en comprobante individual:**

- Cuota del circuito.
- Cargo de reconexion si aplica.
- Comision o cargo adicional por tarjeta.
- Otros conceptos aplicables.
- Total final cobrado al residente.

**Resultado esperado en reportes del circuito:**

- La recaudacion del circuito suma solo la cuota que corresponde al circuito.
- Las comisiones de tarjeta se muestran por separado.
- Las comisiones no inflan la recaudacion del circuito.

### P-007 - Historial de recibos del residente sin comisiones en total acumulado

**Area:** Historial de residente.

**Estado:** corregido en historial visible del residente y tickets listados.

**Problema:** el monto total del historial debe reflejar solo lo pagado al
circuito, no los cargos extra de pago con tarjeta.

**Resultado esperado:**

- Historial/resumen del residente: solo cuota del circuito y reconexion si aplica.
- Comprobante individual: total completo con desglose.
- La comision de tarjeta no se mezcla con recaudacion del circuito.

## Prioridad media

### P-008 - Mensajes de error claros y numerados

**Area:** Manejo de errores.

**Estado:** parcialmente corregido en los flujos principales tocados; queda como
politica de UX para extenderlo a todas las pantallas.

**Problema:** algunos errores se muestran como mensajes tecnicos o codigos poco
comprensibles.

**Resultado esperado:**

- Todo error visible al usuario tiene un numero o clave amigable.
- El mensaje explica que paso.
- El mensaje explica por que pudo pasar.
- El mensaje indica que puede hacer el usuario.
- Los detalles tecnicos quedan en logs, no en la pantalla.

**Formato sugerido:**

```text
Error SIS4S-001
No pudimos registrar el pago.
Puede ocurrir si el mes ya fue pagado o si la conexion fallo.
Actualiza la pantalla y verifica el historial antes de intentarlo de nuevo.
```

### P-009 - Orden de reportes del mas reciente al mas antiguo

**Area:** Reportes.

**Estado:** corregido para gastos/ingresos financieros y exportaciones Excel.

**Problema:** algunos reportes muestran los movimientos recientes al final.

**Resultado esperado:**

- Pagos, gastos, ingresos y movimientos se ordenan por fecha descendente.
- Si dos movimientos tienen la misma fecha, ordenar por fecha de creacion o folio
  descendente.
- La exportacion Excel debe respetar el mismo orden que la pantalla.

### P-010 - Metricas de administrador separadas por circuito

**Area:** Dashboard administrador.

**Estado:** corregido en backend y visible en panel de metricas admin.

**Resultado esperado por circuito:**

- Total recaudado.
- Pagos recibidos.
- Residentes al corriente.
- Residentes con adeudos.
- Monto pendiente por cobrar.
- Comisiones generadas por pagos en linea.

### P-011 - Operacion separada por circuito

**Area:** Panel de operacion.

**Estado:** corregido con desglose operativo por circuito para administrador.

**Resultado esperado:**

- Cortes, reconexiones y datos operativos se consultan por circuito.
- Administrador puede filtrar por circuito.
- Representante solo ve su circuito.
- Cuadrilla ve solo lo que esta autorizado a operar.

### P-012 - Ver datos publicos del residente desde representante

**Area:** Perfiles y contacto.

**Estado:** corregido en el panel del representante con modal de contacto.

**Resultado esperado:**

- El representante puede abrir el detalle de un residente de su circuito.
- Puede ver datos publicos de contacto permitidos: nombre, edificio,
  departamento, telefono/correo si estan autorizados como contacto publico.
- No se muestran datos sensibles innecesarios.
- El acceso se valida tambien en backend.

## Prioridad baja / UX

### P-013 - Footer al fondo en pantallas cortas

**Area:** Interfaz.

**Estado:** corregido en layout raiz; pendiente de revision visual en staging.

**Problema:** pantallas con poco contenido pueden dejar el pie de pagina flotando
a mitad de la ventana.

**Resultado esperado:**

- El layout raiz usa altura minima de ventana.
- El contenido principal crece para empujar el footer al fondo.
- En pantallas con mucho contenido, el footer queda despues del contenido.
- En pantallas cortas, el footer queda pegado al fondo de la ventana.

**Implementacion sugerida:**

- `body` o wrapper raiz con `min-height: 100vh`.
- Layout en columna.
- `main` con `flex: 1`.
- Footer fuera de `main`.

## Dependencias entre pendientes

- P-006 y P-007 deben resolverse juntos para no duplicar logica financiera.
- P-005 depende de definir el inicio real de deuda por residente.
- P-010 necesita que P-006/P-007 separen cuota y comisiones correctamente.
- P-004 debe probarse antes de cambiar `binary_mode` o reglas CSP en produccion.
- P-002 requiere ejecutar la migracion `0023_password_reset_requests.sql` en el
  ambiente donde se pruebe.

## Checklist rapido para staging

- [ ] Ejecutar migraciones pendientes en staging.
- [ ] Probar login con "Recordar usuario".
- [ ] Probar solicitud y generacion de codigo de recuperacion.
- [ ] Probar registro con telefono valido e invalido.
- [ ] Probar pago Mercado Pago con residente nuevo.
- [ ] Probar pago tesorera de atrasados, actual y adelantados.
- [ ] Confirmar bloqueo de meses ya pagados.
- [ ] Revisar recibo individual de tarjeta.
- [ ] Revisar historial de recibos del residente.
- [ ] Revisar orden de reportes.
- [ ] Revisar metricas por circuito.
- [ ] Revisar footer en pantallas cortas.
