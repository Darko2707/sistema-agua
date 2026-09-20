# SIS4S — contrato de reglas para la generalización multi-tenant

Versión: 1.0  
Estado: baseline para diseño y migraciones  
Fecha: 2026-09-16

Este documento ejecuta el paso 1 de la generalización de SIS4S: fija las
reglas que deben permanecer estables antes de cambiar el esquema, las policies
de tRPC o los procesos de cobro.

La regla principal es:

> Un usuario pertenece a un solo fraccionamiento.

No se implementan cambios de base de datos en este paso. Las reglas de este
documento son las invariantes que deberán comprobar las migraciones, los
repositorios y los endpoints.

## 1. Límites de pertenencia

### 1.1 Usuario

- Un usuario normal tiene exactamente un `fraccionamiento_id`.
- Un usuario no puede consultar ni modificar datos de otro fraccionamiento.
- Un usuario no se mueve silenciosamente de fraccionamiento. El cambio, si se
  llega a necesitar, debe ser una operación administrativa explícita, auditada
  y transaccional.
- La pertenencia no se obtiene del `slug` enviado por el navegador. Se obtiene
  de la sesión y del registro del usuario.
- Una cuenta residente tiene un solo perfil residente.

### 1.2 Administrador y suscripción

- Existe un único usuario con rol `admin` para toda la plataforma.
- `admin` tiene alcance global y puede operar cualquier fraccionamiento, pero
  toda mutación debe recibir y validar un `fraccionamiento_id` objetivo. Un
  valor ausente nunca significa “todos” para una mutación destructiva.
- No existirán administradores secundarios por fraccionamiento en esta versión.
- El producto se contrata mediante una suscripción anual por fraccionamiento.
  La suscripción pertenece al tenant, no al usuario administrador ni a un
  circuito.
- La suscripción debe tener estado, fechas de vigencia, periodo de gracia y
  registro de renovaciones. Al vencer, el fraccionamiento pasa a modo de solo
  lectura tras el periodo de gracia configurable: no se crean nuevos cobros,
  cortes ni usuarios, pero se conserva el historial.
- La baja o cambio de plan no elimina datos históricos y queda auditado.

### 1.3 Circuito

- Cada circuito pertenece a exactamente un fraccionamiento.
- Un perfil residente solo puede usar circuitos de su propio fraccionamiento.
- Un representante solo puede tener un circuito principal.
- Una tesorera solo puede tener un circuito principal.
- Una cuadrilla operativa puede tener asignaciones explícitas a uno o más
  circuitos del mismo fraccionamiento.
- Nunca se resolverá un circuito de tesorería o de operación mediante un
  fallback implícito basado únicamente en el perfil residencial.

## 2. Roles y alcance

Los roles de plataforma serán:

| Rol | Alcance inicial | Puede modificar pagos | Puede operar cortes físicos |
|---|---|---:|---:|
| `admin` | Toda la plataforma; único usuario global, con tenant objetivo explícito | Sí | Sí |
| `representante` | Un tenant y su circuito principal | Pagos manuales de su circuito | No, salvo autorización futura explícita |
| `tesorera` | Un tenant y su circuito principal | Pagos manuales y movimientos financieros de su circuito | No |
| `cuadrilla_cortes` | Asignaciones de circuito/servicio dentro de un tenant | No | Sí, únicamente agua u otro servicio autorizado |
| `operador_pozo` | Asignaciones operativas explícitas dentro de un tenant | No | No por defecto |
| `residente` | Su perfil, su tenant y sus servicios contratados | Inicia pagos propios; no confirma pagos contables | No |

`operador_pozo` debe existir como rol independiente. No se tratará como alias
de `cuadrilla_cortes`.

Todos los roles distintos de `admin` son independientes de un único
fraccionamiento. Su sesión, asignaciones y consultas deben quedar siempre
acotadas a ese tenant; no se reutiliza una asignación de otro fraccionamiento.

El backend debe comprobar siempre, en este orden:

1. sesión válida;
2. rol;
3. fraccionamiento del usuario;
4. circuito asignado;
5. servicio autorizado;
6. propiedad del recurso solicitado.

La interfaz puede ocultar controles, pero nunca sustituye estas comprobaciones.

## 3. Servicios

`servicios` es un catálogo global. Contiene claves inmutables, no nombres
editables:

- `agua`;
- `chapeo`;
- `basura`;
- `vigilancia`.

Cada fraccionamiento activa servicios mediante
`fraccionamiento_servicios`. Un servicio no puede utilizarse solo porque exista
en el catálogo global.

Reglas:

- La activación es independiente por fraccionamiento.
- La configuración económica pertenece a la activación del fraccionamiento,
  no al catálogo global.
- Un perfil residente solo puede suscribirse a un servicio activo de su mismo
  fraccionamiento.
- La suscripción es única por `(perfil_residente, servicio)`, o por la fila de
  activación equivalente.
- En la primera versión, `agua`, `chapeo`, `basura` y `vigilancia` tienen cobro
  mensual cuando el fraccionamiento los active.
- `con_corte_fisico` y `solo_facturacion` son comportamientos distintos.
- Solo un servicio configurado como `con_corte_fisico` puede crear cortes o
  reconexiones.

## 4. Perfil residente y estado del servicio

El perfil residencial identifica una vivienda dentro de un circuito:

```text
fraccionamiento → circuito → edificio → departamento
```

La vivienda es única por circuito, edificio y departamento.

### 4.1 Cambios de perfil con autorización

- Cualquier cambio de datos del perfil que afecte identidad, vivienda,
  circuito, edificio, departamento, titularidad o contacto relevante se inicia
  como una solicitud; el residente no modifica directamente esos campos.
- La solicitud debe guardar solicitante, valores anteriores y nuevos, motivo,
  fecha, estado (`pendiente`, `aprobada`, `rechazada`) y aprobador.
- Solo el representante del mismo fraccionamiento y circuito puede aprobarla.
  Si el cambio mueve la vivienda a otro circuito, se requiere además la
  autorización del representante del circuito destino o del `admin` global.
- La aprobación aplica el cambio y su auditoría en una única transacción. Una
  solicitud aprobada no puede ejecutarse dos veces ni ser aprobada por un rol de
  otro tenant.
- El cambio conserva pagos, cortes, reconexiones y demás historial asociado a
  la vivienda; no se borra ni se reasigna retroactivamente.
- Los campos puramente de presentación (por ejemplo, preferencias de idioma)
  pueden quedar fuera de aprobación, pero esa excepción debe estar definida en
  el contrato del endpoint.

El estado del agua dejará de ser la fuente principal en
`perfiles_residente.estado_agua` y migrará a `perfil_servicio`. Durante la
transición se mantendrán ambas columnas, pero debe existir una única operación
de escritura y un proceso de reconciliación que detecte discrepancias.

La máquina de agua conserva estas transiciones:

```text
activo → pendiente_corte → cortado → pendiente_reconexion → activo
```

Los servicios de facturación simple no reutilizarán esas transiciones.

## 5. Reglas de pagos

- Un pago pertenece a un único fraccionamiento, circuito, perfil y servicio.
- La unicidad contable será:

```text
(perfil_residente, servicio, mes, anio)
```

- Un mismo `payment_id` de Mercado Pago no puede acreditar dos perfiles,
  tenants o servicios distintos.
- Los pagos históricos son inmutables en su configuración económica. Si cambia
  una tarifa, el pago conserva los valores con los que fue creado.
- Se distinguen explícitamente:
  - `monto_base`;
  - recargos;
  - comisión de Mercado Pago;
  - retenciones;
  - `monto_cobrado`;
  - `monto_neto_representante`.
- Los pagos manuales no incluyen recargos de tarjeta.
- Los pagos con tarjeta congelan la configuración usada al crear la intención.
- Un reverso es una operación auditada; no se elimina el historial financiero.

## 6. Mercado Pago

La configuración de Mercado Pago se almacena a nivel de fraccionamiento en
una entidad separada (por ejemplo, `fraccionamiento_metodos_pago`), no por
circuito ni por servicio. El token/credencial se cifra, nunca se envía al
cliente y solo el `admin` puede rotarlo. Los servicios reutilizan esa cuenta,
pero cada intención conserva su propio tenant, servicio e importe congelado.

Una intención de pago debe quedar ligada a:

```text
fraccionamiento
servicio
activación del servicio
perfil
circuito
periodos
importe congelado
collector
```

El webhook y la ruta de retorno deben verificar toda esa cadena antes de
acreditar el pago.

Las referencias antiguas se conservarán solo durante una ventana de
compatibilidad y deberán marcarse con una versión. Las referencias nuevas
incluirán tenant y servicio de forma verificable mediante la intención
persistida.

## 7. Operaciones y concurrencia

- Pago, ticket, cambio de estado y notificación deben confirmarse en una única
  transacción cuando formen parte de la misma operación.
- Corte y reconexión deben bloquear el perfil y el corte activo antes de
  modificar estado.
- Los locks deben incluir servicio cuando el perfil pueda tener varios
  servicios simultáneos.
- Los trabajos automáticos deben usar claves de deduplicación con:

```text
tenant + perfil + servicio + periodo + tipo_de_evento
```

- Ningún cron o worker puede procesar un servicio inactivo.

## 8. Auditoría y datos personales

Deben auditarse como mínimo:

- cambio de rol;
- cambio de tenant o circuito;
- alta y baja de servicios;
- registro, edición, reverso y eliminación de pagos;
- gastos e ingresos;
- cortes y reconexiones;
- cambios de configuración de Mercado Pago.

La verificación pública de folios debe revelar únicamente los datos mínimos
necesarios para confirmar autenticidad. No debe exponer nombre, departamento,
método de pago o historial financiero completo.

## 9. Invariantes que deben pasar antes de la fase 2

La migración no puede avanzar si alguna de estas consultas devuelve resultados:

1. circuitos sin fraccionamiento;
2. usuarios no administradores sin fraccionamiento;
3. perfiles cuyo circuito pertenece a otro fraccionamiento que su usuario;
4. representantes o tesoreras asignados a un circuito de otro tenant;
5. dos perfiles para la misma vivienda;
6. perfiles sin suscripción de agua activa;
7. pagos cuyo perfil, circuito y tenant no coinciden;
8. tickets sin pago válido;
9. pagos pagados sin folio, fecha o método;
10. dos pagos pagados para el mismo perfil, servicio y periodo;
11. dos cortes activos para el mismo perfil y servicio;
12. intenciones de Mercado Pago sin servicio o tenant consistente.

## 10. Criterio de finalización del paso 1

El paso 1 se considera completado cuando:

- estas reglas son aprobadas por el responsable del negocio;
- cualquier excepción queda documentada;
- las reglas se convierten en casos de prueba;
- las migraciones posteriores referencian este documento;
- no se modifica el esquema hasta convertir estas decisiones en migraciones,
  policies y pruebas de aceptación.

## 11. Decisiones cerradas para el paso 2

1. Habrá un único `admin` global para toda la plataforma.
2. La facturación del producto será una suscripción anual por fraccionamiento.
3. No habrá administradores secundarios por tenant en esta versión.
4. `representante`, `tesorera`, `operador_pozo`, `cuadrilla_cortes` y
   `residente` pertenecerán a un solo fraccionamiento; representante y tesorera
   se limitarán además a un circuito principal.
5. Mercado Pago se configurará una vez por fraccionamiento y se reutilizará
   para sus servicios.
6. Los cuatro servicios (`agua`, `chapeo`, `basura`, `vigilancia`) podrán tener
   cobro mensual cuando estén activos.
7. Los cambios de datos de perfil requerirán autorización del representante,
   con historial de valores anteriores y nuevos; un traslado entre circuitos
   requiere también autorización del circuito destino o del `admin`.

## 12. Implementación del paso 2

La migración `db/migrations/0024_multi_tenant_foundation.sql` implementa estos
cimientos de forma aditiva:

- crea `fraccionamientos` y `suscripciones_fraccionamiento` para el contrato
  anual;
- añade el catálogo `servicios` y las activaciones por tenant;
- mueve la configuración futura de Mercado Pago a
  `fraccionamiento_metodos_pago`;
- crea `perfiles_servicios` y `solicitudes_cambio_perfil`;
- añade y rellena `fraccionamiento_id` en usuarios no administradores, circuitos,
  perfiles, pagos, intenciones MP, ingresos y gastos;
- impone un único `admin` global y prepara la pertenencia obligatoria de los
  usuarios operativos; una cuenta residente recién creada puede quedar
  temporalmente sin tenant durante el onboarding, hasta completar su perfil;
- crea índices para consultas por tenant y periodo;
- registra los cuatro servicios y activa agua para el tenant histórico 4 Soles.

Durante la ventana de backfill, los campos nuevos de tablas existentes son
opcionales en los tipos TypeScript para no romper escrituras legacy; la
migración los deja `NOT NULL` en PostgreSQL. Antes de retirar esa compatibilidad
debe completarse el paso 3 (propagar el tenant en todos los handlers y
endpoints).

La migración no se ejecuta automáticamente contra Neon. Debe aplicarse primero
en staging, verificarse con las invariantes de la sección 9 y promoverse a
producción con respaldo y ventana de mantenimiento.

## 13. Implementación del paso 3

El tenant autenticado ya se propaga en el contexto de tRPC como
`ctx.user.fraccionamientoId`. `protectedProcedure` bloquea cuentas operativas
sin tenant y `assertTenantAccess` centraliza la comparación contra un tenant
objetivo; `admin` conserva alcance global, pero sus mutaciones deben recibir un
objetivo explícito.

Además:

- el repositorio de usuarios expone el tenant de la cuenta;
- los repositorios de circuitos y perfiles exponen su tenant para comprobar
  pertenencia antes de operar;
- cortes y reconexiones de cuadrilla validan tenant y circuito del perfil
  objetivo;
- el alta de un perfil fija el tenant del usuario y del perfil dentro de una
  transacción;
- pagos, ingresos y gastos escriben el `fraccionamiento_id` derivado del
  recurso autorizado;
- las intenciones de Mercado Pago derivan y persisten el tenant del perfil,
  evitando que el cliente pueda elegirlo.

La cobertura posterior consiste en ampliar el filtro explícito del tenant a
consultas históricas adicionales y retirar las columnas legacy de Mercado Pago
por circuito después de la migración.

La migración `db/migrations/0025_migrate_mp_config_to_tenant.sql` consolida
primero las credenciales legacy por fraccionamiento y falla si detecta dos
credenciales o `collector_id` distintos para el mismo tenant. La eliminación
de columnas se mantiene separada para poder validar checkout, webhooks y
retornos en staging antes de ejecutar una operación irreversible.
