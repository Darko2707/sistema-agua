# Auditoría técnica integral — Sistema de gestión de agua

**Fecha:** 2026-08-11 (actualizada el 2026-08-14)

**Proyecto:** sistema de gestión de agua para fraccionamiento

**Alcance:** seguridad, autenticación/autorización, Mercado Pago, pagos/tickets, cortes y reconexiones, PostgreSQL/Drizzle, tareas programadas, infraestructura, frontend, accesibilidad, pruebas y mantenibilidad.

> Las ubicaciones corresponden a la línea base previa a las correcciones de esta auditoría. Este documento distingue los cambios automáticos seguros de los asuntos que requieren una decisión de negocio, datos, UX u operación. Ninguna migración se ejecuta automáticamente.

## Resumen ejecutivo

| Severidad | Hallazgos | Corregidos o preparados automáticamente | Pendientes de decisión o trabajo posterior |
|---|---:|---:|---:|
| Crítica | 4 | 4 | 0 |
| Alta | 31 | 16 | 15 |
| Media | 41 | 1 | 40 |
| Baja | 12 | 0 por instrucción | 12 |
| **Total** | **88** | **21** | **67** |

Los riesgos dominantes hallados fueron: acreditación de Mercado Pago sin enlazar el pago real con la intención/importe, replay de pagos después de un reverso, migraciones no reproducibles, hashes de contraseña incompatibles con Better Auth, carreras y límites transaccionales incompletos, y fugas de alcance entre circuitos. Las exposiciones explotables que admitían una corrección segura quedaron corregidas o preparadas mediante migración; entre los riesgos pendientes están las preferencias de pago simultáneas y la divergencia entre la infraestructura declarada (Railway/BullMQ) y la implementada (Vercel Cron + outbox PostgreSQL).

El total final incluye hallazgos descubiertos al revisar las correcciones: una carrera entre la verificación del pago y un cambio de circuito del residente (A-MP-02), una referencia de checkout incompatible con los límites de Mercado Pago (A-MP-03), el posible solapamiento de preferencias activas (A-MP-04), generación de códigos sin solicitud del residente (A-RESET-01), carreras en el canje del código (A-RESET-02) y rehabilitación tras un pago parcial con deuda restante (A-PAY-06). A-MP-02, A-MP-03 y ambos hallazgos de recuperación se corrigieron; A-MP-04 y A-PAY-06 requieren política de negocio/UX.

## Resultado de las correcciones automáticas

Se corrigieron o dejaron preparados 20 hallazgos críticos/altos que no requerían una decisión de negocio:

- **Mercado Pago y pagos:** A-SEC-01, A-SEC-02, A-PAY-01, A-PAY-02, A-PAY-03, A-PAY-05, A-MP-02 y A-MP-03. La validación enlaza ID, intención opaca, perfil, circuito, token, MXN, total y collector; el `return` dejó de acreditar; la intención se consume en la misma transacción que acredita el pago; el circuito se revalida bajo lock; el replay posterior a un reverso es terminal; el reverso y la auditoría manual son atómicos. La migración `0022_mercado_pago_payment_intents.sql` fue generada y no ejecutada.
- **Autenticación/autorización:** A-AUTH-01, A-AUTHZ-02, A-RESET-01 y A-RESET-02. Las nuevas contraseñas usan scrypt de Better Auth, se mantiene verificación bcrypt sólo para hashes heredados y un representante sin circuito ya no ve métricas globales. El código de recuperación exige una solicitud pendiente, se genera una sola vez por solicitud y su canje serializa intentos, rol, circuito, contraseña, sesiones y auditoría. A-AUTHZ-01 permanece pendiente porque prohibir que el personal sea también residente requiere definir esa política de negocio. La migración `0023_password_reset_requests.sql` fue generada y no ejecutada.
- **Migraciones e integridad:** A-DB-01 y A-DB-02 quedaron reproducibles de forma defensiva. Para A-DB-03, A-DB-05 y la unicidad del reverso de A-PAY-03 se generó `0021_payment_integrity_guards.sql`, con preflight que aborta ante datos incompatibles. **La migración no fue ejecutada**, por lo que esas garantías aún no están activas en una base desplegada.
- **Frontend/operación/pruebas:** A-FE-01, A-OBS-01, A-OPS-01 y A-TEST-01. Se eliminó el estado obsoleto de los modales, se agregó telemetría sanitizada cuando el rate limit falla abierto, se corrigió el runbook a Vercel Blob y la integración ahora exige una `TEST_DATABASE_URL` explícita y distinta.
- **Endurecimiento posterior solicitado:** M-RATE-01 se corrigió con IP canónica de Vercel, buckets HMAC por IP/cuenta, namespaces Upstash, límites de body/batch/concurrencia y guards de exportación/PDF. WAF y Deployment Protection requieren activación manual.

El alta/edición/baja de personal de A-DB-07 sólo se endureció parcialmente: crear `user` y `account` ya es atómico, pero las asignaciones multirrepositorio siguen pendientes porque su solución depende de confirmar cardinalidad y reglas de reemplazo. A-SEC-01 ya cuenta con una intención persistida y consumible atómicamente; el ledger inmutable histórico propuesto en A-PAY-01 permanece como evolución arquitectónica.

### Verificaciones funcionales solicitadas durante el cierre

- **Pagos de 1 a 12 meses:** hay casos parametrizados para cada cantidad, importes, periodos, referencia opaca e intención de Mercado Pago. Tesorería limita cada lote a 12, clasifica atrasado/actual/adelantado, deshabilita meses pagados y el servidor rechaza de forma atómica un periodo que cambió a pagado. La autorización real de una tarjeta no se probó contra sandbox.
- **Recuperación:** el input visible sólo conserva seis dígitos y el backend rechaza espacios, guiones, letras o longitud distinta. El representante sólo ve `Generar código` después de una solicitud pendiente; al generar, la solicitud se consume y el botón no reaparece hasta una nueva petición.
- **Recordar usuario:** el login guarda únicamente el correo normalizado, por opt-in, en `localStorage`; nunca guarda contraseña, token ni sesión y tolera almacenamiento bloqueado.
- **Perímetro Vercel:** se implementaron límites por IP y cuenta, batches/body/concurrencia, namespaces Upstash y alertas agrupadas. La activación de WAF/Deployment Protection permanece externa y documentada en `docs/vercel-edge-security.md`.

## Método y evidencia

- Revisión estática de rutas App Router, procedimientos tRPC, servicios de dominio, repositorios Drizzle, esquema y las 21 migraciones de línea base `0000`–`0020`; también se revisaron las nuevas `0021`, `0022` y `0023`, sin ejecutarlas.
- Revisión de autenticación Better Auth 1.6.26, sesiones, roles, layouts protegidos, CORS/origin, CSRF/cookies y headers de seguridad.
- Revisión de Mercado Pago, firma del webhook, credenciales por circuito, idempotencia, tickets/folios y retornos.
- Revisión de crons, outbox de Web Push, locks, leases, retries y documentación de despliegue/backup.
- Se consultó la documentación instalada de Next.js 16 en `node_modules/next/dist/docs/` antes de proponer cambios en Route Handlers, Proxy, autenticación, variables de entorno, CSP y `after()`.
- Línea base: `npm test` aprobó 31 archivos y 307/307 pruebas.
- Estado final: `npx tsc --noEmit --incremental false` aprobado, 0 errores; `npm test -- --reporter=dot` aprobó 47 archivos y 510/510 pruebas tras endurecer también recuperación, pagos multimes, límites de tráfico y la preferencia local de usuario en login.
- `npm run lint`: 0 errores y 23 advertencias.
- `npm run build`: aprobado; 32 páginas/rutas construidas.
- `npx drizzle-kit check --config drizzle.config.ts`: aprobado. Este comando no sustituye el replay real del SQL ni corrige la falta de snapshots posteriores a `0012`.
- `npm audit`: 0 vulnerabilidades críticas/altas y 6 moderadas transitivas.
- `npm run worker`: falla con `ERR_MODULE_NOT_FOUND` porque `workers/tickets.ts` no existe.
- No se ejecutaron suites de integración ni migraciones. En la línea base la integración cargaba `.env.local` y podía escribir en Neon; el guard ya fue corregido, pero no se dispuso de una `TEST_DATABASE_URL` desechable. Tampoco hay Docker/PostgreSQL local disponible. La cadena de migraciones se verificó estáticamente, no contra una base real vacía.

## Hallazgos críticos

### A-SEC-01 — Mercado Pago no enlaza el pago aprobado con la intención e importe esperados

- **Severidad:** crítica.
- **Ubicación:** `app/api/mercadopago/webhook/route.ts:67-98`; `app/api/mercadopago/return/route.ts:24-71`; `src/infrastructure/mercadopago/parser.ts:63-116`; `src/application/pagos/commands/procesar-pago-mp.handler.ts:78-116`.
- **Descripción:** basta que Payment API devuelva `approved`; meses, monto y reconexión se toman de `external_reference`. No se compara el `ref` usado para elegir credenciales con la referencia real, `transaction_amount`, `currency_id`, `collector_id`, perfil, circuito ni total recalculado. El `return` público también escribe en la base. Un pago barato, en otra moneda o creado con una credencial comprometida puede acreditar importes o periodos ficticios.
- **Corrección propuesta y aplicada:** persistir una intención de pago opaca con perfil, circuito, periodos, importe, moneda, collector y expiración calculados exclusivamente en servidor; resolverla durante la verificación y consumirla bajo lock en la misma transacción que acredita el pago. Mantener temporalmente la lectura del formato legado sólo para preferencias ya emitidas.
- **Tratamiento:** corregido automáticamente en código. Se generó `db/migrations/0022_mercado_pago_payment_intents.sql`, pero no se ejecutó; la protección requiere desplegar esa migración antes que el código.

### A-DB-01 — La migración `0001` aborta al reproducirse desde cero

- **Severidad:** crítica.
- **Ubicación:** `db/migrations/0001_steady_vivisector.sql:68-77`.
- **Descripción:** primero elimina tablas con `CASCADE`, lo que elimina sus FK, y enseguida intenta eliminar esas mismas constraints sin `IF EXISTS`. Una instalación limpia se detiene.
- **Corrección propuesta:** usar `DROP CONSTRAINT IF EXISTS` para las cuatro constraints. Drizzle no reejecuta migraciones históricas ya aplicadas, por lo que el parche sólo repara bootstrap nuevos.
- **Tratamiento:** autocorrección inmediata; no se ejecuta ninguna migración.

### A-DB-02 — Las migraciones `0002`/`0003`/`0004` recrean columnas y FK

- **Severidad:** crítica.
- **Ubicación:** `db/migrations/0002_circuito_pagos_mercadopago.sql:1-15`; `db/migrations/0003_circuito_monto_reconexion.sql:1`; `db/migrations/0004_demonic_harry_osborn.sql:2-18`.
- **Descripción:** `0004` vuelve a agregar casi todo lo ya agregado por `0002`, además de `monto_reconexion` de `0003`, y vuelve a crear las FK. Una base nueva aborta por objetos duplicados.
- **Corrección propuesta:** conservar en `0004` sólo el nuevo valor del enum y `circuitos.activo`; retirar de esa migración las operaciones ya realizadas. Documentar la excepción al principio de historial inmutable.
- **Tratamiento:** autocorrección inmediata; no se ejecuta ninguna migración.

### A-PAY-01 — Un webhook repetido reacredita un pago ya reversado

- **Severidad:** crítica.
- **Ubicación:** `src/infrastructure/db/repositories/drizzle-pago.repository.ts:291-299`; `server/routers/operacion.ts:244-252`; `db/schema.ts:175-177`.
- **Descripción:** la idempotencia busca pagos existentes sólo en estado `pagado`. El reverso cambia el original a `vencido`; un replay del mismo `mercadoPagoPaymentId` vuelve a ver el periodo libre, crea otro pago y ticket, y restaura el servicio. El índice parcial permite el duplicado porque sólo cubre filas pagadas.
- **Corrección propuesta:** tratar cualquier fila con el mismo Payment ID, sin importar estado, como replay terminal; impedir reutilizarlo para otro perfil y mantener los periodos del lote como una unidad. A futuro, ledger inmutable `mercado_pago_payments` con Payment ID único y asignaciones por periodo.
- **Tratamiento:** autocorrección inmediata con pruebas de reverso/replay; ledger pendiente.

## Hallazgos altos

### A-SEC-02 — La firma del webhook no cubre el Payment ID procesado

- **Severidad:** alta.
- **Ubicación:** `app/api/mercadopago/webhook/route.ts:50-63`; `tests/api/webhook-mercadopago.test.ts:189-199`.
- **Descripción:** la firma valida `data.id` de la query, pero luego se prefiere `payload.data.id`/`payload.id`, que no formó parte de esa validación. Un cuerpo alterado puede hacer que se consulte otro pago durante la ventana de tolerancia.
- **Corrección propuesta:** procesar exclusivamente el ID firmado; si el body contiene ID, exigir igualdad; validar esquema/tipo del evento.
- **Tratamiento:** autocorrección inmediata y prueba de mismatch.

### A-AUTH-01 — Contraseñas creadas fuera de Better Auth son incompatibles

- **Severidad:** alta.
- **Ubicación:** `src/infrastructure/db/repositories/drizzle-user.repository.ts:34-44`; `src/application/usuarios/commands/actualizar-personal.handler.ts:38-40`; `src/infrastructure/db/services/representative-password-reset.service.ts:183-203`; `lib/auth.ts:24-28`.
- **Descripción:** esas tres rutas escriben bcrypt, mientras Better Auth 1.6.26 verifica scrypt por defecto. Se reprodujo que `verifyPassword` lanza `Invalid password hash` sobre `$2b$...`. Personal creado por admin, cuentas actualizadas y residentes reseteados no pueden iniciar sesión.
- **Corrección propuesta:** escribir scrypt con `better-auth/crypto` y configurar verificación dual scrypt/bcrypt temporal para hashes históricos; no es posible transformar hashes existentes sin conocer el plaintext.
- **Tratamiento:** autocorrección inmediata con pruebas de ambos formatos.

### A-AUTHZ-01 — Personal privilegiado puede autoasignarse un circuito mediante `crearPerfil`

- **Severidad:** alta.
- **Ubicación:** `server/routers/usuarios.ts:59-75`; `src/application/residentes/commands/crear-perfil.handler.ts:74-99`; `server/routers/cortes.ts:19-29,52-88`; `src/application/circuitos/queries/resolver-circuito-tesorera.service.ts:25-36`.
- **Descripción:** cualquier usuario autenticado, incluso tesorera/cuadrilla/representante, puede elegir `circuitoId`. El perfil se usa después como alcance de cuadrilla y fallback de tesorera, produciendo escalación horizontal.
- **Corrección propuesta:** limitar alta de perfil a residente o enlazarla a asignaciones explícitas; retirar el fallback después de auditar/migrar datos.
- **Tratamiento:** pendiente de definir si el personal puede ser simultáneamente residente y cómo se asigna cuadrilla.

### A-AUTHZ-02 — Representante sin circuito recibe métricas globales

- **Severidad:** alta.
- **Ubicación:** `server/routers/operacion.ts:382-397`.
- **Descripción:** si `findByRepresentante` devuelve `null`, los filtros quedan `undefined`; Drizzle consulta todos los residentes, pagos y cortes.
- **Corrección propuesta:** fallar con `FORBIDDEN` o devolver métricas vacías antes de ejecutar queries.
- **Tratamiento:** autocorrección inmediata y prueba de aislamiento.

### A-ONB-01 — Registro público permite apropiarse de una vivienda

- **Severidad:** alta.
- **Ubicación:** `lib/auth.ts:24-28`; `server/routers/usuarios.ts:59-83`; `src/application/residentes/commands/crear-perfil.handler.ts:74-104`.
- **Descripción:** no hay email verificado, invitación, padrón/prealta ni aprobación. Cualquiera puede elegir una dirección activa y el índice único impide luego el alta del residente legítimo.
- **Corrección propuesta:** invitaciones o preprovisión/aprobación por representante, con email verificado y recuperación de claims.
- **Tratamiento:** pendiente de decisión de onboarding/negocio.

### A-PAY-02 — Checkout cobra aun cuando el circuito está inhabilitado

- **Severidad:** alta.
- **Ubicación:** `app/api/mercadopago/checkout/route.ts:106-112`.
- **Descripción:** obtiene la configuración del circuito, pero no verifica `activo`; puede crear una preferencia durante una suspensión administrativa.
- **Corrección propuesta:** responder 403 antes de crear la preferencia y cubrirlo con una prueba.
- **Tratamiento:** autocorrección inmediata.

### A-MP-01 — Un solo secreto de webhook puede no corresponder a tokens de múltiples apps

- **Severidad:** alta, condicional a la configuración real.
- **Ubicación:** `app/api/mercadopago/webhook/route.ts:21-35,50-56`; tokens por circuito en `db/schema.ts:110-121`.
- **Descripción:** el sistema almacena credenciales MP por circuito pero valida todos los webhooks con un único `MP_WEBHOOK_SECRET`. Si pertenecen a aplicaciones MP distintas, los secretos también son distintos.
- **Corrección propuesta:** una aplicación/OAuth central o secreto cifrado por cuenta, seleccionado sólo mediante dato previamente autenticado.
- **Tratamiento:** pendiente de confirmar la topología Mercado Pago de producción.

### A-DB-03 — `pagos.metodo` no coincide con el enum declarado en el esquema

- **Severidad:** alta.
- **Ubicación:** `db/schema.ts:16,167`; `db/migrations/0000_cynical_magdalene.sql:41`; `db/migrations/meta/0012_snapshot.json:707-712`.
- **Descripción:** el esquema usa `metodo_pago`, pero ninguna migración crea ese tipo ni convierte la columna, que queda `text`. Una DB fresca diverge del contrato Drizzle y carece de validación.
- **Corrección propuesta:** nueva migración con preflight de valores, creación del enum y `ALTER COLUMN ... USING`; actualizar metadatos/baseline.
- **Tratamiento:** generar migración segura, sin ejecutarla.

### A-DB-04 — Metadatos Drizzle se detienen en `0012`

- **Severidad:** alta.
- **Ubicación:** `db/migrations/meta/_journal.json:96-150`; directorio `db/migrations/meta/`.
- **Descripción:** el journal registra `0013`–`0020`, pero no existen snapshots posteriores a `0012`. `drizzle-kit check` informa éxito porque no reproduce el SQL ni representa objetos manuales; un próximo `generate` puede reproponer cambios ya desplegados.
- **Corrección propuesta:** crear un baseline/snapshot autoritativo en una rama de DB desechable y agregar fresh-replay + diff cero a CI.
- **Tratamiento:** pendiente de escoger estrategia de baseline; no fabricar snapshots a ciegas.

### A-PAY-03 — Reverso concurrente y auditoría fuera de la transacción

- **Severidad:** alta.
- **Ubicación:** `server/routers/operacion.ts:238-287`.
- **Descripción:** lee/valida fuera de la transacción, no bloquea la fila ni condiciona el `UPDATE` a `estado='pagado'`; dos solicitudes pueden insertar dos reversos. La auditoría ocurre después del commit, por lo que puede fallar y hacer que el cliente reintente un cambio ya aplicado.
- **Corrección propuesta:** leer con `FOR UPDATE` dentro de la transacción, revalidar estado/visibilidad, actualizar condicionalmente y guardar reverso, ticket, perfil, notificación y auditoría en el mismo commit; índice único por `pago_id` tras preflight.
- **Tratamiento:** autocorrección de código y migración generada, no ejecutada.

### A-PAY-04 — Reversar localmente no reembolsa Mercado Pago ni define el recorte posterior

- **Severidad:** alta.
- **Ubicación:** `server/routers/operacion.ts:244-280`.
- **Descripción:** “reversar” sólo cambia la contabilidad local; no solicita refund. Si una reconexión física ya ocurrió, el perfil puede quedar activo aunque el pago se anule.
- **Corrección propuesta:** decidir entre anulación contable y reembolso real; si hay refund, modelar estados intermedios, idempotencia y política de recorte/revisión humana.
- **Tratamiento:** pendiente de decisión de negocio.

### A-DB-05 — La relación pago-ticket no está protegida como 1:1

- **Severidad:** alta.
- **Ubicación:** `db/schema.ts:220-227,439-442`.
- **Descripción:** `tickets.pago_id` no es único ni tiene índice, aunque las relaciones y el dominio asumen un solo ticket por pago. La DB permite duplicados.
- **Corrección propuesta:** migración con preflight explícito y `UNIQUE (pago_id)`, que también aporta el índice.
- **Tratamiento:** generar migración, no ejecutarla.

### A-DB-06 — Asignaciones de representante/tesorera ambiguas y no atómicas

- **Severidad:** alta.
- **Ubicación:** `db/schema.ts:110-121`; `src/infrastructure/db/repositories/drizzle-user.repository.ts:93-139,160-244`; `server/routers/usuarios.ts:156-175`.
- **Descripción:** no hay unicidad; un usuario puede aparecer en varios circuitos y los `findFirst` producen un alcance arbitrario. La asignación y el cambio de rol se hacen en operaciones separadas, no limpian correctamente a desplazados y la rama de desasignación es inalcanzable.
- **Corrección propuesta:** transacción con locks y regla explícita de cardinalidad; si es 1:1, índices únicos parciales tras preflight y reconciliación.
- **Tratamiento:** pendiente de confirmar cardinalidad y política de desplazamiento.

### A-DB-07 — Alta/edición/baja de personal cruza varios commits

- **Severidad:** alta.
- **Ubicación:** `src/infrastructure/db/repositories/drizzle-user.repository.ts:34-45`; `src/application/usuarios/commands/crear-personal.handler.ts:29-45`; `actualizar-personal.handler.ts:36-63`; `eliminar-personal.handler.ts:36-42`.
- **Descripción:** `user` y `account` se crean por separado; los handlers encadenan credenciales, rol, asignación y soft delete en transacciones distintas. Un fallo intermedio deja cuentas huérfanas o asignaciones parciales.
- **Corrección propuesta:** una unidad de trabajo compartida por caso de uso. Como mínimo, crear `user`+`account` en una transacción.
- **Tratamiento:** autocorrección del mínimo seguro; refactor completo pendiente por alcance arquitectónico.

### A-PAY-05 — Pago manual y auditoría no son atómicos

- **Severidad:** alta.
- **Ubicación:** `server/routers/pagos.ts:74-94`; repositorio de pago `src/infrastructure/db/repositories/drizzle-pago.repository.ts:96-164`.
- **Descripción:** el pago se acredita dentro del repositorio y después se inserta auditoría. Si ésta falla, el cliente ve error y puede reintentar. Además se audita `entidadId=result.folio`, pero los filtros esperan el UUID de pago.
- **Corrección propuesta:** incorporar la auditoría a la misma transacción y usar el ID real; alternativamente, devolver éxito con telemetría si sólo falló la auditoría, sin inducir retry.
- **Tratamiento:** autocorrección segura del límite transaccional si el puerto puede ampliarse sin romper contratos; de lo contrario documentar deuda residual.

### A-CUT-01 — La bitácora permite falsificar confirmaciones de corte/reconexión

- **Severidad:** alta.
- **Ubicación:** `server/routers/operacion.ts:302-327`.
- **Descripción:** permite acciones `corte_confirmado`/`reconexion_confirmada` sin ejecutar la máquina de estados, acepta un `corteId` que puede pertenecer a otro perfil y guarda bitácora/auditoría en commits separados.
- **Corrección propuesta:** reservar confirmaciones al servicio de transición; dejar aquí sólo notas/visitas, comprobar corte-perfil y guardar bitácora+auditoría juntos.
- **Tratamiento:** pendiente de confirmar qué acciones usa realmente la UX de campo.

### A-INF-01 — El worker Railway/BullMQ declarado no existe

- **Severidad:** alta.
- **Ubicación:** `package.json:14`; ausencia de `workers/`, BullMQ/ioredis y configuración Railway.
- **Descripción:** `npm run worker` apunta a `workers/tickets.ts` y falla. El sistema real usa outbox PostgreSQL, `after()` y Vercel Cron; no existe conexión Redis/BullMQ que pueda auditarse o reconectarse.
- **Corrección propuesta:** elegir e implementar una topología: worker durable real, o retirar el script y documentar formalmente Vercel/outbox.
- **Tratamiento:** pendiente de arquitectura/operación.

### A-INF-02 — Cortes y avisos mensuales no tienen recuperación durable

- **Severidad:** alta.
- **Ubicación:** `vercel.json:3-4`; `app/api/cron/avisos-corte/route.ts:38-59`; `app/api/cron/cortes/route.ts:28-51`; `src/infrastructure/db/repositories/drizzle-residente.repository.ts:184-207`; `src/infrastructure/db/jobs/encolar-proximos-corte.ts:36-57`.
- **Descripción:** se ejecutan una sola vez al mes. Vercel Cron no reintenta un fallo y puede entregar duplicados. Además, `SKIP LOCKED` puede omitir una fila bloqueada durante la única ejecución. Un 5xx, timeout o lock puntual pierde el ciclo completo.
- **Corrección propuesta:** ejecución frecuente con ventana de negocio y ledger/checkpoint durable, alerta de run ausente y procesamiento idempotente; alternativamente, worker durable.
- **Tratamiento:** pendiente de arquitectura y costo del plan.

### A-FE-01 — Los modales financieros conservan/mezclan estado anterior

- **Severidad:** alta.
- **Ubicación:** `components/representante/ReporteFinanciero.tsx:94-103,180-188,617-632`.
- **Descripción:** el estado se inicializa desde `inicial` sólo en el primer montaje y los modales permanecen montados cerrados. Editar puede no precargar el registro y reabrir conserva datos previos, causando sobrescrituras incorrectas.
- **Corrección propuesta:** montar sólo cuando estén abiertos y usar una `key` estable por registro/modo; limpiar estado al cerrar.
- **Tratamiento:** autocorrección inmediata con prueba de regresión cuando sea viable.

### A-FE-02 — Los paneles sólo administran los primeros 50 residentes

- **Severidad:** alta.
- **Ubicación:** `hooks/useAdmin.ts:81-93,152-156,174`; `components/admin/AdminDashboard.tsx:31-48,170-185`; `components/representante/RepresentanteDashboard.tsx:135-151`.
- **Descripción:** siempre se consulta página 1 de 50 y la metadata se ignora. Búsqueda/filtros operan sólo sobre esos 50; el residente 51 en adelante queda invisible e inmanejable.
- **Corrección propuesta:** paginación y filtros server-side o carga incremental con contador total.
- **Tratamiento:** pendiente de decisión UX y escala esperada.

### A-DATE-01 — Fechas contables pueden desplazarse al día anterior en México

- **Severidad:** alta.
- **Ubicación:** `components/representante/ReporteFinanciero.tsx:95,181,307-325,515,521,585,591`; `server/routers/reportes.ts:297-310,367-378`; `db/schema.ts:345-372`.
- **Descripción:** se produce `YYYY-MM-DD` con UTC, backend usa `new Date('YYYY-MM-DD')` y DB guarda `timestamp`; al renderizar en México suele verse el día anterior. Mes/año también pueden divergir de la fecha.
- **Corrección propuesta:** semántica date-only en PostgreSQL o convención explícita `America/Mexico_City`, con migración de datos históricos validada.
- **Tratamiento:** pendiente de regla contable y migración.

### A-LEGAL-01 — El consentimiento legal se puede omitir invocando la API

- **Severidad:** alta.
- **Ubicación:** `app/(auth)/registro/page.tsx:20-28,131-137,157,185`; `server/routers/usuarios.ts:58-75`; `server/routers/operacion.ts:97-125`.
- **Descripción:** el checkbox y la mutación de consentimiento están en un paso de cliente separado; `crearPerfil` no exige registro vigente. Un cliente tRPC directo crea el perfil sin aceptar.
- **Corrección propuesta:** precondición server-side versionada, idealmente en flujo transaccional/reanudable.
- **Tratamiento:** pendiente de criterio legal y UX de cuentas existentes.

### A-OBS-01 — La caída del rate limit desactiva la protección sin alerta

- **Severidad:** alta.
- **Ubicación:** `proxy.ts:27-44`; `server/routers/usuarios.ts:30-51`; `lib/ratelimit.ts:4-30`.
- **Descripción:** los errores de Upstash se absorben y el tráfico continúa; login/reset quedan sin defensa y no existe señal operativa.
- **Corrección propuesta:** conservar temporalmente fail-open para disponibilidad, pero emitir log estructurado y Sentry sin IP/token crudo; después definir fallback/fail-closed selectivo.
- **Tratamiento:** autocorrección inmediata de observabilidad; política de disponibilidad pendiente.
- **Actualización 2026-08-14:** corregido en el repositorio. Los fallos fail-open de rate limit y semáforos emiten telemetría sanitizada con fingerprint estable y cooldown de cinco minutos, aplicado antes tanto del log como de Sentry. Los conflictos financieros no se descartan. Sigue pendiente decidir si alguna ruta debe pasar a fail-closed y configurar alertas/retención en los proveedores.

### A-OPS-01 — El runbook de backup apunta a un almacenamiento que no se usa

- **Severidad:** alta.
- **Ubicación:** `docs/backup.md:92-103,119`; implementación real `src/infrastructure/storage/vercel-blob.adapter.ts:1-38`.
- **Descripción:** el documento ordena respaldar Cloudflare R2/bucket `tickets-agua`, pero producción guarda PDFs en Vercel Blob privado. Un simulacro no respaldaría los objetos reales.
- **Corrección propuesta:** corregir proveedor, credenciales, inventario y procedimiento; definir retención/exportación verificada.
- **Tratamiento:** autocorrección documental segura, sin ejecutar copias ni borrar datos.

### A-TEST-01 — La suite de integración puede mutar la DB de `.env.local`

- **Severidad:** alta.
- **Ubicación:** `tests/integration/setup.ts:3-7`; `tests/integration/morosos-cron.test.ts`; `vitest.integration.config.ts`.
- **Descripción:** carga `.env.local`; las pruebas hacen escrituras globales y restauran después. Una interrupción puede dejar datos de Neon alterados. Por seguridad, la auditoría no la ejecutó.
- **Corrección propuesta:** exigir `TEST_DATABASE_URL`, rechazar si coincide con `DATABASE_URL` y nunca hacer fallback a `.env.local`.
- **Tratamiento:** autocorrección inmediata; no se ejecutará la suite sin DB desechable explícita.

### A-MP-02 — Cambio de circuito entre verificación y acreditación

- **Severidad:** alta.
- **Ubicación:** `app/api/mercadopago/webhook/route.ts:82-99`; `src/application/pagos/commands/procesar-pago-mp.handler.ts:72-125`; `src/infrastructure/db/repositories/drizzle-pago.repository.ts:280-320`.
- **Descripción:** la verificación consultaba el pago con las credenciales del circuito A, pero el handler volvía a cargar el perfil antes de que el repositorio tomara el lock. Si el perfil cambiaba concurrentemente al circuito B, podía acreditar B con un pago, importe y collector validados para A.
- **Corrección propuesta y aplicada:** transportar el `circuitoId` verificado por todo el comando, exigir coherencia en el handler y volver a comprobarlo dentro de la transacción después de bloquear el perfil. Hay pruebas de mismatch previo y bajo lock.
- **Tratamiento:** corregido automáticamente durante la revisión final.

### A-MP-03 — `external_reference` de pagos multimes excede el contrato de Mercado Pago

- **Severidad:** alta.
- **Ubicación:** `app/api/mercadopago/checkout/route.ts:40-57,151-224`; `src/infrastructure/mercadopago/payment-intent.ts:10-127`; `src/infrastructure/mercadopago/payment-verification.ts:67-203`; `src/infrastructure/db/repositories/drizzle-pago.repository.ts:418-579`; `db/schema.ts:157-178`; `db/migrations/0022_mercado_pago_payment_intents.sql`.
- **Descripción:** el formato legado `agua3|<UUID>|<periodos>|<reconexión>` crecía con cada mes: con un UUID real, un mes quedaba alrededor de 63 caracteres y podía pasar, mientras 12 meses alcanzaban aproximadamente 140. Además utilizaba `|` y comas. Mercado Pago limita `external_reference` a 64 caracteres y al conjunto alfanumérico, guion y guion bajo; esto explica que un mes funcionara y el lote anual fuera rechazado antes del pago, independientemente del saldo de la cuenta de prueba.
- **Corrección propuesta y aplicada:** emitir una referencia opaca `agua_<48 hex>` de 53 caracteres, persistir en servidor el perfil/circuito/periodos/importes asociados y resolver esa intención al verificar el pago. La fila se bloquea y consume atómicamente junto con la acreditación; el parser legado permanece sólo para preferencias ya emitidas.
- **Tratamiento:** corregido automáticamente. Se generó la migración `0022_mercado_pago_payment_intents.sql` y no se ejecutó; debe aplicarse antes de desplegar el código.

### A-MP-04 — Preferencias de pago activas pueden solaparse y producir un cargo no acreditable

- **Severidad:** alta.
- **Ubicación:** `app/api/mercadopago/checkout/route.ts:22-23,170-227`; `src/infrastructure/db/repositories/drizzle-pago.repository.ts:418-579`.
- **Descripción:** la idempotencia actual deduplica la misma selección dentro de una ventana corta, pero no invalida una preferencia anterior cuando el residente cambia periodos o genera otra después. Dos preferencias activas pueden pagarse: la base protege la acreditación duplicada de un periodo, pero el segundo cobro puede quedar aprobado en Mercado Pago y rechazado localmente, requiriendo conciliación o reembolso.
- **Corrección propuesta:** definir si debe existir una sola preferencia activa por residente/circuito y, según la política elegida, guardar y reutilizarla, expirar/cancelar la anterior o bloquear una nueva selección; la UX debe mostrar claramente el pago pendiente y el flujo de recuperación/reembolso.
- **Tratamiento:** pendiente de decisión de negocio y UX; no se modificó el código.

### A-RESET-01 — El representante podía generar códigos sin solicitud del residente

- **Severidad:** alta.
- **Ubicación:** `server/routers/usuarios.ts:81-128`; `src/infrastructure/db/services/representative-password-reset.service.ts:56-257`; `components/representante/RepresentanteDashboard.tsx:140-216,501-520`; `db/migrations/0023_password_reset_requests.sql`.
- **Descripción:** el flujo anterior permitía a un representante generar repetidamente un código para cualquier residente de su circuito sin que existiera una solicitud del titular. Como el representante ve el código y éste permite cambiar la contraseña, una cuenta privilegiada comprometida podía iniciar por sí sola una toma de cuenta.
- **Corrección propuesta y aplicada:** solicitud pública con respuesta anti-enumeración, una sola solicitud pendiente por usuario mediante índice parcial, listado mínimo por circuito y consumo condicional dentro de la misma transacción que genera el código. La interfaz retira el botón después del consumo y sólo lo muestra ante una nueva solicitud.
- **Tratamiento:** corregido automáticamente. Se generó `0023_password_reset_requests.sql` y no se ejecutó; debe desplegarse antes que el código.

### A-RESET-02 — Intentos y canje del código no estaban serializados

- **Severidad:** alta.
- **Ubicación:** `src/infrastructure/db/services/representative-password-reset.service.ts:259-415`; `server/routers/usuarios.ts:129-159`; `tests/infrastructure/representative-password-reset-request.service.test.ts`.
- **Descripción:** el contador de intentos se leía fuera de la transacción. Solicitudes concurrentes podían observar el mismo valor y superar el máximo; además, un cambio concurrente de rol, perfil o circuito podía dejar canjear un reto emitido para un estado de autorización anterior.
- **Corrección propuesta y aplicada:** orden global de locks perfil→challenge, revalidación transaccional de usuario, rol residente, soft delete, circuito activo, reto exacto, expiración y contador; consumo, contraseña scrypt, revocación de sesiones, cierre de solicitud y auditoría comparten commit. La entrada y el esquema aceptan exclusivamente seis dígitos sin separadores.
- **Tratamiento:** corregido automáticamente con pruebas de concurrencia, quinto intento, cambio de rol/circuito y reemplazo de reto.

### A-PAY-06 — Un pago parcial atrasado puede rehabilitar el servicio con deuda restante

- **Severidad:** alta; requiere decisión de negocio.
- **Ubicación:** `server/routers/pagos.ts:235-260`; `src/infrastructure/db/repositories/drizzle-pago.repository.ts:382-411`.
- **Descripción:** tesorería permite seleccionar de 1 a 12 meses dentro de la acción disponible. Si un residente cortado o pendiente de corte paga sólo uno de varios atrasos, el mismo lote puede pasar a `pendiente_reconexion` o cancelar `pendiente_corte`, aunque todavía existan meses vencidos.
- **Corrección propuesta:** definir si rehabilitar exige liquidar todos los atrasos, el mes actual o un mínimo acordado; después, recalcular el saldo restante dentro de la misma transacción antes de cambiar el estado del agua.
- **Tratamiento:** pendiente de política de cobranza/reconexión; no se cambió silenciosamente el comportamiento existente.

## Hallazgos medios

En la fase inicial estos hallazgos se documentaron sin cambios. M-RATE-01 se corrigió posteriormente por petición explícita; los demás permanecen pendientes salvo que su tratamiento indique lo contrario.

### M-SEC-01 — Código de reset de seis dígitos con SHA-256 sin pepper

- **Ubicación:** `src/infrastructure/db/services/representative-password-reset.service.ts:29-32,98-104,155-180`.
- **Descripción:** una lectura de DB permite probar offline el millón de combinaciones.
- **Corrección propuesta:** HMAC con secreto dedicado o hash lento y plan para invalidar códigos vivos.

### M-AUTH-01 — Política de sesión/MFA implícita para personal privilegiado

- **Ubicación:** `lib/auth.ts:24-28`; mínimos de contraseña en `server/routers/usuarios.ts:99-104,186-205,229-249`.
- **Descripción:** se heredan defaults Better Auth (instalado: sesión deslizante de 7 días, updateAge de 1 día), sin MFA, verificación de email ni reautenticación sensible.
- **Corrección propuesta:** política explícita por rol y MFA/reauth para administración, reversos y cambios de credenciales.

### M-RATE-01 — Rate limit fail-open, IP confiada y limitador tRPC sin uso

- **Ubicación:** `lib/ratelimit.ts:4-30`; `proxy.ts:6-44`; `server/routers/usuarios.ts:30-51`.
- **Descripción:** además del silencio de A-OBS-01, se toma el primer `x-forwarded-for`, Redis es opcional y `trpcLimiter` nunca se usa.
- **Corrección propuesta:** clave cuenta+IP, header canónico de plataforma, fallback local/acotado y límites sobre mutaciones costosas.
- **Tratamiento 2026-08-14:** corregido en la capa de aplicación: `x-vercel-forwarded-for` es canónico en Vercel; las identidades Redis usan HMAC; Upstash queda separado por proyecto, ambiente, versión y superficie; tRPC limita IP+cuenta, batch, body y concurrencia; auth, tickets y exportaciones tienen guards específicos. Las unit tests nunca usan Upstash real por defecto. El fail-open selectivo permanece por disponibilidad y está instrumentado.
- **Pendiente externo:** activar WAF primero con acción `log`, reglas separadas para auth/checkout/tRPC/tickets/reportes, bypass exacto para webhook/crons y Standard Deployment Protection. No se modificó el dashboard ni se fijaron umbrales WAF porque requieren plan, tráfico observado, retención y política operativa. Runbook: `docs/vercel-edge-security.md`.

### M-SEC-02 — Exportación completa envía ciphertext de tokens Mercado Pago

- **Ubicación:** `server/routers/operacion.ts:364-379`.
- **Descripción:** `with: { circuito: true }` serializa también `mercadoPagoAccessToken` cifrado hacia el cliente/admin.
- **Corrección propuesta:** proyección explícita y redacción de secretos aun cifrados.

### M-SEC-03 — Verificación pública de ticket expone PII y no limita intentos

- **Ubicación:** `server/routers/tickets.ts:8-46`; `app/verificar/[folio]/page.tsx:6-75`.
- **Descripción:** revela nombre, edificio/departamento, monto, fecha y método a quien posea el folio.
- **Corrección propuesta:** acordar datos mínimos, enmascarar PII, aplicar rate limit y auditar consultas.

### M-SEC-04 — CSP permite scripts inline

- **Ubicación:** `next.config.ts:4-12`.
- **Descripción:** `script-src 'unsafe-inline'` reduce la protección frente a XSS.
- **Corrección propuesta:** nonce/hash conforme a Next.js 16, con pruebas de SSR/SSG antes de retirar la excepción.

### M-MP-01 — No se hace cumplir sandbox/producción y se acepta token plaintext legado

- **Ubicación:** `app/api/mercadopago/checkout/route.ts:172`; `lib/crypto.ts:45-55`; `docs/staging-operativo.md:27-40`.
- **Descripción:** no se detecta token TEST en producción/APP_USR en staging y el fallback plaintext puede perpetuar credenciales sin cifrar.
- **Corrección propuesta:** validar cuenta/entorno y migrar secretos antes de rechazar plaintext en producción.

### M-MP-02 — Webhook reconoce 200 ante configuración/perfil faltante y no valida tipo de evento

- **Ubicación:** `app/api/mercadopago/webhook/route.ts:58-76`.
- **Descripción:** un fallo temporal de lookup/token se reconoce como procesado y puede perder un pago; body/action no tienen esquema estricto.
- **Corrección propuesta:** Zod para eventos de pago y distinguir error permanente (2xx) de temporal (5xx/retry).

### M-MP-03 — El modo binario puede reducir la aprobación de pagos multimes

- **Ubicación:** `app/api/mercadopago/checkout/route.ts:239`.
- **Descripción:** la preferencia envía `binary_mode: true`. [Mercado Pago advierte](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-settings/binary-mode) que, para conservar un resultado instantáneo, los pagos que necesitarían quedar pendientes o en revisión se rechazan automáticamente y la tasa de aprobación puede disminuir. Un importe anual puede activar revisión aun cuando un importe mensual no lo haga; es una hipótesis adicional para el fallo reportado, no demostrada sin el `status_detail` de una operación sandbox.
- **Corrección propuesta:** decidir si el negocio acepta estados pendientes/procesando. Si se desactiva el modo binario, probar el ciclo tardío completo, evitar preferencias solapadas (A-MP-04), mostrar estado pendiente y definir conciliación/reembolso.
- **Tratamiento:** pendiente de decisión de riesgo/UX y prueba real en sandbox; no se cambió `binary_mode` automáticamente.

### M-SEC-05 — Redirect de retorno se basa en el origin recibido

- **Ubicación:** `app/api/mercadopago/return/route.ts:25-32`.
- **Descripción:** fuera de un proxy que normalice Host, permite redirigir al host solicitado.
- **Corrección propuesta:** construir destinos desde `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` validados.

### M-API-01 — Parámetros REST de reportes se castean sin validación estricta

- **Ubicación:** `app/api/reportes/residentes/route.ts:67-101`; `app/api/reportes/financiero/route.ts:82-105,212-215`.
- **Descripción:** enums se fuerzan por cast y `parseInt` acepta prefijos; valores inválidos pueden causar 500.
- **Corrección propuesta:** Zod con regex/coerce estricto, enums y límites.

### M-AUTHZ-01 — Circuito inactivo no bloquea de forma uniforme a tesorera/cuadrilla

- **Ubicación:** `src/application/acceso/verificar-acceso.service.ts:29-43`; `server/routers/cortes.ts:52-88`.
- **Descripción:** ambos roles están exentos del control de circuito activo.
- **Corrección propuesta:** definir si “inactivo” congela campo/finanzas o sólo residentes/representante.

### M-OBS-01 — Logs y Sentry pueden almacenar UUID/importes/ref de pago

- **Ubicación:** `instrumentation.ts:16-19`; `app/api/mercadopago/webhook/route.ts:78-86`; `return/route.ts:51-59`.
- **Descripción:** query strings y logs explícitos contienen datos correlacionables.
- **Corrección propuesta:** scrub de query/PII y política de retención/acceso.

### M-PAY-01 — Una colisión UNIQUE manual puede reportar como éxito otra operación

- **Ubicación:** `src/infrastructure/db/repositories/drizzle-pago.repository.ts:153-161`.
- **Descripción:** ante cualquier unique violation devuelve el pago ganador aunque pertenezca a otro método/flujo, induciendo auditoría falsa.
- **Corrección propuesta:** sólo considerar replay si existe una clave idempotente equivalente; en pago manual, devolver conflicto.

### M-CUT-01 — La máquina permite reconectar sin pago

- **Ubicación:** `src/domain/cortes/state-machine.ts:91-104`; `src/application/cortes/services/corte-operacion.service.ts:149-152`.
- **Descripción:** el comportamiento está probado y parece intencional, pero contradice una política común de reconexión condicionada.
- **Corrección propuesta:** confirmar si cuadrilla/admin puede hacer excepción y cómo se audita.

### M-DB-01 — Faltan CHECK/NOT NULL para invariantes financieras

- **Ubicación:** `db/schema.ts:150-171,345-372`.
- **Descripción:** mes/año, montos, folio, método, estado y reconexión admiten valores fuera del dominio o nulos.
- **Corrección propuesta:** preflight de históricos y migración gradual con checks/rangos/defaults acordados.

### M-DB-02 — Cascadas pueden borrar contabilidad/bitácora histórica

- **Ubicación:** `db/schema.ts:272,347,361`.
- **Descripción:** hard delete de circuito/perfil elimina ingresos, gastos o bitácora.
- **Corrección propuesta:** política de retención; normalmente `RESTRICT`/soft delete para registros contables y auditoría.

### M-DB-03 — Índices faltantes en columnas consultadas

- **Ubicación:** `db/schema.ts:64-76,110-121,150-171,220-227,345-372`; consultas en `drizzle-user.repository.ts:82-90` y `drizzle-pago.repository.ts:84-88`.
- **Descripción:** faltan índices en `account.user_id`, asignaciones de circuito, `tickets.pago_id`, representante de gastos/ingresos, estado global y pagos por mes/año.
- **Corrección propuesta:** medir cardinalidad/EXPLAIN y generar migración; algunas deben ser UNIQUE sólo tras resolver A-DB-06.

### M-DATE-01 — Timestamps sin zona mezclan TZ de proceso, DB y negocio

- **Ubicación:** `db/schema.ts:46-48,170-171,210-213,238,250,264,332-337,351-354,366-369`; `drizzle-pago.repository.ts:443-457`; `server/routers/pagos.ts:133-135`; `server/routers/reportes.ts:42-49`.
- **Descripción:** límites y agregaciones pueden cambiar en bordes de día/mes según la zona de sesión.
- **Corrección propuesta:** fijar UTC técnico, usar `America/Mexico_City` para fecha de negocio y migrar a `timestamptz` sólo tras interpretar históricos.

### M-BUG-01 — Mora incorrecta con más de doce prepagos futuros

- **Ubicación:** `src/application/pagos/queries/historial-pagos.handler.ts:25-32`; `drizzle-pago.repository.ts:75-80`.
- **Descripción:** sólo se miran las doce filas más recientes; suficientes meses futuros pueden desplazar al mes vigente y marcarlo moroso.
- **Corrección propuesta:** consultar el periodo vigente por clave, no inferirlo de una ventana limitada.

### M-PERF-01 — Sobrelectura de historiales y agregación O(P×R)

- **Ubicación:** `drizzle-residente.repository.ts:85-134`; `resumen-mes.handler.ts:31-48`.
- **Descripción:** listados cargan todos los pagos/cortes por residente y después repiten búsquedas en memoria. No se halló N+1 clásico, pero sí volumen y complejidad evitables.
- **Corrección propuesta:** proyecciones SQL del pago vigente/corte activo y agregados por circuito.

### M-BUG-02 — Cron de morosidad incluye circuitos inactivos

- **Ubicación:** `drizzle-residente.repository.ts:184-207`.
- **Descripción:** puede marcar `pendiente_corte` en circuitos administrativamente suspendidos.
- **Corrección propuesta:** definir semántica de inactividad y filtrar por circuito activo si corresponde.

### M-PUSH-01 — Entrega Web Push es at-least-once y puede duplicarse

- **Ubicación:** `lib/push-dispatcher.ts:329-350`.
- **Descripción:** si el proveedor acepta y falla el update `enviada`, la lease vence y se reenvía. `Topic` no garantiza dedupe después de mostrado.
- **Corrección propuesta:** documentar semántica y hacer UI tolerante/idempotente o usar receipts.

### M-PUSH-02 — Posible starvation del outbox

- **Ubicación:** `lib/push-dispatcher.ts:132-185`.
- **Descripción:** siempre toma las 1000 notificaciones más antiguas, incluso si sus deliveries están en backoff; las nuevas pueden quedar fuera indefinidamente.
- **Corrección propuesta:** seleccionar pendientes sin deliveries materializadas o paginar por cursor/estado.

### M-PUSH-03 — Faltan pruebas directas de leases, crash y concurrencia

- **Ubicación:** lógica `lib/push-dispatcher.ts:104-584`; pruebas actuales de push.
- **Descripción:** no se cubren dos dispatchers, lease vencida, crash post-envío, finalización ni starvation.
- **Corrección propuesta:** pruebas de integración DB con concurrencia y fallos inyectados.

### M-PUSH-04 — Errores persistiendo deliveries no llegan a Sentry

- **Ubicación:** `lib/push-dispatcher.ts:425-434`.
- **Descripción:** se loguean y absorben por fila; la lease queda viva hasta expirar sin alerta agregada.
- **Corrección propuesta:** captura rate-limited con IDs técnicos no sensibles.

### M-INF-01 — Health check incompleto e inconsistente

- **Ubicación:** `app/api/health/route.ts:4-14,28-49`.
- **Descripción:** sólo verifica presencia de claves Upstash, no reachability; omite secretos/URLs de auth y Blob. Puede dar 200 con servicios críticos rotos o 503 por Redis que el resto trata opcional.
- **Corrección propuesta:** separar liveness/readiness/degraded y declarar dependencias obligatorias.

### M-INF-02 — `after()` depende de una duración no declarada

- **Ubicación:** `lib/push-dispatcher.ts:485-495,590-598`; `app/api/trpc/[trpc]/route.ts:1-15`; rutas MP.
- **Descripción:** el dispatcher presupone hasta 240 s, pero las rutas no exportan `maxDuration`; en planes/proyectos con límite corto se corta el trabajo post-respuesta.
- **Corrección propuesta:** declarar duración compatible o reducir el lote y confiar en cron/worker.

### M-INF-03 — Retry de aviso no despacha si todo fue deduplicado

- **Ubicación:** `app/api/cron/avisos-corte/route.ts:40-52`.
- **Descripción:** sólo dispara dispatcher si `encoladas > 0`; tras una caída posterior al insert, un retry inserta 0 y difiere la entrega hasta el cron diario.
- **Corrección propuesta:** despachar siempre con presupuesto acotado.

### M-CI-01 — CI omite integración y E2E

- **Ubicación:** `package.json:17-18`; `.github/workflows/ci.yml:29-42`; `vitest.config.ts:6`.
- **Descripción:** sólo unit tests entran al gate; concurrencia/DDL/DB real y Playwright quedan fuera.
- **Corrección propuesta:** PostgreSQL/Neon efímero y smoke E2E contra preview.

### M-OPS-01 — Runbook promete un modo mantenimiento inexistente

- **Ubicación:** `docs/backup.md:74-88`; `proxy.ts`; ausencia de `/mantenimiento`.
- **Descripción:** `MAINTENANCE_MODE=true` no bloquea escrituras ni redirige, por lo que un restore seguiría recibiendo mutaciones.
- **Corrección propuesta:** implementar y probar un bloqueo server-side o corregir el procedimiento operativo.

### M-FE-01 — Modal de rango conserva periodo/error obsoleto

- **Ubicación:** `components/shared/ExcelRangoModal.tsx:32-42`; uso en `ReporteFinanciero.tsx:401-409`.
- **Descripción:** inicializa desde props una sola vez y queda montado.
- **Corrección propuesta:** montaje condicional, `key` o reset al abrir.

### M-FE-02 — Rechazos de promesas no se consumen en handlers

- **Ubicación:** `ReporteFinanciero.tsx:314-330`; `components/admin/OperacionTab.tsx:69-78`.
- **Descripción:** `mutateAsync`/exportación usan `finally` sin `catch`; aunque haya toast, queda un rechazo no manejado.
- **Corrección propuesta:** `catch` explícito o API `mutate` con callbacks.

### M-FE-03 — Error de red se presenta como “sin circuito”

- **Ubicación:** `components/tesorera/PagosTesorera.tsx:75-77,126-140`.
- **Descripción:** ignora `query.error` y confunde fallo/500 con estado vacío.
- **Corrección propuesta:** UI de error y retry independiente del empty state.

### M-FE-04 — Query param no confiable muestra pago como exitoso

- **Ubicación:** `components/residente/ResidenteDashboard.tsx:45-67,197-207,316-329`.
- **Descripción:** cualquiera puede abrir `?payment=success`; no acredita en backend, pero el mensaje induce a creerlo confirmado.
- **Corrección propuesta:** “retorno recibido/verificando” o consultar estado autorizado por referencia.

### M-DATE-02 — Periodo de negocio depende de la zona del navegador

- **Ubicación:** `ResidenteDashboard.tsx:241-257`; `PagosTesorera.tsx:40-56,78`; `ResidentesTab.tsx:14-32`; `RepresentanteDashboard.tsx:217`; `MetricasTab.tsx:45-54`; `ReporteResidentes.tsx:200-201`.
- **Descripción:** al operar fuera de México o cerca de cambio de mes, UI puede pedir/etiquetar un periodo distinto del backend.
- **Corrección propuesta:** helper compartido con zona México o periodo entregado por servidor.

### M-PERF-02 — Búsqueda remota sin debounce

- **Ubicación:** `components/representante/ReporteResidentes.tsx:57-70,123-128`.
- **Descripción:** cada tecla dispara una query costosa y respuestas en carrera.
- **Corrección propuesta:** debounce 250–400 ms, cancelación y `keepPreviousData`.

### M-TYPE-01 — Contratos tRPC duplicados con tipos manuales/casts

- **Ubicación:** `hooks/useAdmin.ts:21-56,89-96`; `OperacionTab.tsx:9-35,59-61,85-87`; `TrabajadorDashboard.tsx:34-40,162-163`; `app/(residente)/residente/folios/page.tsx:32-52,116`.
- **Descripción:** las assertions ocultan drift a pesar de tRPC.
- **Corrección propuesta:** `inferRouterOutputs<AppRouter>` y tipos inferidos por hooks.

### M-VALID-01 — Backend financiero más laxo que formularios

- **Ubicación:** `server/routers/reportes.ts:292-340,363-403`.
- **Descripción:** ediciones aceptan fecha arbitraria y conceptos sin trim/máximo; `new Date` puede ser inválido.
- **Corrección propuesta:** schema compartido, fecha estricta y límites definidos con negocio.

### M-A11Y-01 — Modales y controles carecen de semántica/foco/nombre accesible

- **Ubicación:** `ReporteFinanciero.tsx:122-124,207-209,520-528,590-598`; `ExcelRangoModal.tsx:65-107`; `ResidentesTab.tsx:133-148,243-249`; `OperacionTab.tsx:163-170`; páginas admin de representantes/tesoreras; filtros en `TrabajadorDashboard.tsx`, `PagosTesorera.tsx` y `AdminDashboard.tsx`.
- **Descripción:** faltan `role=dialog`, `aria-modal`, Escape, focus trap/restore, nombres de botones sólo-icono, `htmlFor/id` y roles/estado de tabs.
- **Corrección propuesta:** componente Dialog accesible compartido y pruebas teclado/lector.

### M-DEP-01 — Seis vulnerabilidades moderadas transitivas

- **Ubicación:** `package-lock.json`; cadenas `drizzle-kit → @esbuild-kit → esbuild` y `exceljs → uuid`.
- **Descripción:** no hay altas/críticas. La de esbuild afecta servidor de desarrollo; la de uuid alcanza dependencia productiva de ExcelJS, aunque el proyecto no llama directamente las variantes vulnerables.
- **Corrección propuesta:** actualizar cuando las dependencias superiores publiquen una ruta compatible; no aceptar el downgrade disruptivo sugerido automáticamente por npm.

## Hallazgos bajos y deuda técnica

### L-API-01 — Normalización de folio inconsistente

- **Ubicación:** `server/routers/tickets.ts:9-13`; `app/api/tickets/[folio]/pdf/route.ts:39-43`; `app/verificar/[folio]/page.tsx:6-10`.
- **Descripción:** el PDF uppercasing, tRPC no; la página no valida formato/largo.
- **Corrección propuesta:** normalizador Zod único.

### L-QR-01 — No hay QR/firma offline aunque quedan campos heredados

- **Ubicación:** `db/schema.ts:220-226`; `server/services/pdf.ts:86-91`.
- **Descripción:** el folio NanoID de 10 caracteres base36 es criptográficamente aleatorio (~51.7 bits) y el lookup online impide falsos registrados; no existe verificación offline ni QR real.
- **Corrección propuesta:** sólo si negocio lo exige, payload mínimo firmado con clave rotatable; no usar identificadores secuenciales/predecibles.

### L-DOC-01 — Documentación de SameSite contradice el código

- **Ubicación:** `docs/api.md:8`; `lib/auth.ts:70-79`.
- **Descripción:** docs dicen Strict y código usa Lax para retorno Mercado Pago.
- **Corrección propuesta:** alinear documentación y explicar el tradeoff.

### L-CODE-01 — Helpers de seguridad duplicados/sin uso

- **Ubicación:** `server/middleware/auth.ts`; `server/policies/pago.policy.ts`; `server/policies/ticket.policy.ts`; `server/services/mercadopago/parser.ts`.
- **Descripción:** pueden divergir de las rutas activas; uno omite tesorera.
- **Corrección propuesta:** eliminar o convertir en única fuente después de confirmar referencias externas.

### L-BUG-01 — Rama de desasignación de representante inalcanzable

- **Ubicación:** `server/routers/usuarios.ts:156-168`.
- **Descripción:** el código contempla vacío, pero Zod exige `.min(1)`.
- **Corrección propuesta:** definir API explícita de desasignación o retirar la rama.

### L-VALID-01 — Varios inputs administrativos carecen de máximos/rangos

- **Ubicación:** `server/routers/usuarios.ts:186-209,229-252`; `server/routers/pagos.ts:150-160`.
- **Descripción:** strings/tokens no tienen máximos y mes/año sólo son números.
- **Corrección propuesta:** límites Zod coherentes con DB y dominio.

### L-CODE-02 — Advertencias lint, componentes/dependencias posiblemente muertas

- **Ubicación:** 23 warnings; ejemplos `app/verificar/[folio]/page.tsx:2-3`, `ReporteResidentes.tsx:5,61`, `server/services/pdf-reportes.ts:79,277,308`; componentes `CircuitoForm.tsx`/`RepresentanteForm.tsx`; dependencias AWS/Supabase/`@trpc/next`/date-fns/jotai.
- **Descripción:** ruido, bundle/supply-chain y riesgo de código sin mantener.
- **Corrección propuesta:** depurar sólo después de confirmar despliegues/uso dinámico.

### L-TYPE-01 — `any` productivo en exportación Excel

- **Ubicación:** `server/services/excel-reportes.ts:40-41`.
- **Descripción:** cast de Buffer para sortear tipos ExcelJS.
- **Corrección propuesta:** adaptador con unión/tipo del consumidor.

### L-DOC-02 — README boilerplate y topología no documentada

- **Ubicación:** `README.md`.
- **Descripción:** conserva create-next-app, incluso bytes NUL, y no explica Vercel/outbox/Cron/Blob/Redis/recuperación.
- **Corrección propuesta:** runbook arquitectónico y de desarrollo reproducible.

### L-INF-01 — Versión de Node no fijada

- **Ubicación:** `.github/workflows/ci.yml:25-27`; `package.json`.
- **Descripción:** CI usa Node 20, auditoría local Node 24 y no hay `engines`/config Railway.
- **Corrección propuesta:** elegir runtime soportado y fijarlo en engines/tooling/plataforma.

### L-DB-01 — Seed no idempotente

- **Ubicación:** `db/seed.ts:13-15`; `db/schema.ts:110-121`.
- **Descripción:** cada ejecución inserta circuito y el nombre no es único.
- **Corrección propuesta:** key estable/upsert después de definir si nombres pueden repetirse.

### L-SUPPLY-01 — Acciones de CI no fijadas por SHA

- **Ubicación:** `.github/workflows/ci.yml`.
- **Descripción:** tags mutables amplían el riesgo de supply chain.
- **Corrección propuesta:** fijar commits SHA y automatizar actualizaciones verificadas.

## Controles positivos verificados

- Todos los procedimientos tRPC que reciben input usan Zod. Los únicos públicos (`listarCircuitos`, solicitud/canje de recuperación y verificación de ticket) son deliberados; la solicitud responde de forma genérica y usa límites separados por IP y cuenta.
- El contexto tRPC y los layouts vuelven a consultar usuario/rol/soft delete en DB; cambio de rol, password y eliminación revocan sesiones.
- No se halló `sql.raw` ni concatenación de input en SQL; los fragmentos raw usan parámetros de Drizzle. No se identificó inyección SQL.
- Corte y reconexión productivos sólo permiten cuadrilla/admin y validan circuito; el servicio crítico usa transacción, locks, auditoría y outbox atómico.
- Checkout exige sesión/origin, calcula periodos/importes en servidor, emite una referencia opaca compatible y persiste la intención; usa idempotency key. La verificación y el consumo transaccional corrigen A-SEC-01/A-SEC-02, sujeto a desplegar primero la migración `0022`.
- Webhook falla cerrado si falta secret y el SDK valida firma/tolerancia. Crons requieren `CRON_SECRET` y comparación timing-safe.
- Folios usan NanoID criptográfico, no son secuenciales y tienen unicidad DB. El PDF privado reautoriza dueño/admin/representante y usa `no-store`/CSP sandbox.
- Headers presentes: HSTS, `nosniff`, `DENY`, referrer policy, permissions policy, `frame-ancestors` y `object-src` restrictivos.
- `.env.local`/`.env.staging` están ignorados y no se encontraron secretos reales hardcodeados ni secretos expuestos mediante `NEXT_PUBLIC_*`.
- El outbox Web Push tiene dedupe, `FOR UPDATE SKIP LOCKED`, leases, backoff exponencial+jitter, timeout, aislamiento por item y circuit breaker de configuración.

## Limitaciones y verificación pendiente

1. Ejecutar la cadena completa de migraciones en una rama Neon vacía/desechable, nunca con `.env.local`, y comprobar catálogo, enum, FK, índices y 24 filas del journal (`0000`–`0023`).
2. Resolver A-DB-04 antes de confiar en el próximo `drizzle-kit generate`.
3. Ejecutar integración/E2E sólo con `TEST_DATABASE_URL` efímera y separada.
4. Probar flujos Mercado Pago contra sandbox real: firma, importe/moneda/collector, replays, reverso y una matriz de 1 a 12 periodos, registrando `status` y `status_detail`; comparar `binary_mode` sólo después de decidir si se aceptan pagos pendientes/en revisión.
5. Confirmar con negocio: onboarding/claims, personal residente, cardinalidad por circuito, reverso vs refund, política para preferencias de pago activas/solapadas, reconexión sin pago, semántica de circuito inactivo y fecha contable.
