# API — Documentación tRPC

Todos los endpoints se exponen en `/api/trpc` mediante **HTTP Batch Link**.
El cliente los invoca como `trpc.<router>.<procedure>.query()` o `.mutate()`.

## Autenticación

Better Auth gestiona sesiones con cookies `HttpOnly` + `SameSite=Strict`.
La sesión viaja automáticamente en cada request via `credentials: 'include'`.

### Roles

| Rol               | Descripción                                    |
|-------------------|------------------------------------------------|
| `admin`           | Acceso total al sistema                        |
| `representante`   | Gestiona su circuito y registra pagos          |
| `tesorera`        | Registra pagos en efectivo/transferencia       |
| `cuadrilla_cortes`| Confirma cortes y reconexiones físicas         |
| `residente`       | Ve su dashboard y paga via Mercado Pago        |

---

## Router: `pagos`

### `pagos.miHistorial` — Query
**Roles:** cualquier usuario autenticado  
Devuelve el historial de pagos del residente actual, incluyendo el estado del mes vigente,
bandera de morosidad, días vencidos, corte activo y desglose de cargos.

**Returns:**
```ts
{
  perfil:       PerfilResidente;
  circuito:     Circuito;
  pagos:        PagoData[];
  corteActivo:  CorteData | null;
  esMoroso:     boolean;
  diasVencido:  number;
  mes:          number;
  anio:         number;
  desgloseVigente: DesglosePago | null;
}
```

---

### `pagos.pagar` — Mutation
**Roles:** `residente`  
Registra un pago manual (efectivo o transferencia) para el mes vigente.

**Input:**
```ts
{ metodo: 'transferencia' | 'efectivo' }
```

---

### `pagos.historialDe` — Query
**Roles:** `admin`, `representante`  
Devuelve el historial de un residente específico.

**Input:** `{ perfilId: string (UUID) }`

---

### `pagos.registrarManual` — Mutation
**Roles:** `representante`  
El representante registra un pago para un residente de su circuito.

**Input:** `{ perfilId: string, metodo: 'efectivo' | 'transferencia' }`

---

### `pagos.registrarManualTesorera` — Mutation
**Roles:** `tesorera`  
La tesorera registra un pago para un residente de su circuito.

**Input:** `{ perfilId: string, metodo: 'efectivo' | 'transferencia' }`

**Returns:** `{ folio: string, monto: string, metodo: string }`

---

### `pagos.registrarRetroactivo` — Mutation
**Roles:** `admin`  
Registra pagos de meses anteriores en lote (máx. 36 meses).

**Input:**
```ts
{
  perfilId: string;
  meses: Array<{ mes: number; anio: number }>;
  metodo: 'efectivo' | 'transferencia';
}
```
**Returns:** `{ registrados: number; omitidos: string[] }`

---

### `pagos.resumenMes` — Query
**Roles:** `admin`, `representante`  
Totales del mes vigente: pagados, recaudado, por circuito.

---

### `pagos.metricasAdmin` — Query
**Roles:** `admin`  
Dashboard de métricas: pagos por día (últimos 30 días), revenue, morosidad %, reconexiones.

**Input (opcional):** `{ mes?: number; anio?: number }`

**Returns:**
```ts
{
  pagosPorDia:     Array<{ fecha: string; cantidad: number; monto: number }>;
  revenueMes:      number;
  totalPagadosMes: number;
  totalResidentes: number;
  morosidadPct:    number;
  reconexionesMes: number;
}
```

---

### `pagos.listarFolios` — Query
**Roles:** cualquier usuario autenticado  
Lista los folios de pago del residente autenticado con datos de circuito.

---

### `pagos.pagosPorCircuito` — Query
**Roles:** `representante`, `admin`  
Lista pagos de un circuito para un mes/año específico.

**Input:** `{ circuitoId?: string; mes?: number; anio?: number }`

---

### `pagos.reportePagos` — Query
**Roles:** `representante`  
Lista todos los pagos pagados del circuito del representante.

---

### `pagos.listarResidentesParaPago` — Query
**Roles:** `tesorera`  
Lista los residentes del circuito de la tesorera con estado de pago del mes vigente.

---

## Router: `cortes`

### `cortes.pendientesDeCorte` — Query
**Roles:** `representante`, `cuadrilla_cortes`, `admin`  
Lista residentes morosos que requieren corte de agua.

### `cortes.pendientesDeReconexion` — Query
**Roles:** `cuadrilla_cortes`, `admin`  
Lista residentes con estado `pendiente_reconexion` que ya pagaron y esperan reconexión física.

### `cortes.confirmarCorte` — Mutation
**Roles:** `cuadrilla_cortes`, `admin`  
Confirma que el corte físico fue ejecutado.  
**Input:** `{ perfilId: string }`

### `cortes.listarCortados` — Query
**Roles:** `cuadrilla_cortes`, `admin`  
Lista residentes con estado `cortado`.

### `cortes.confirmarReconexion` — Mutation
**Roles:** `cuadrilla_cortes`, `admin`  
Confirma reconexión física y cierra el corte activo.  
**Input:** `{ perfilId: string }`

---

## Router: `tickets`

### `tickets.verificar` — Query
**Roles:** público (sin autenticación)  
Verifica la autenticidad de un ticket por folio.  
**Input:** `{ folio: string }`

### `tickets.misTickets` — Query
**Roles:** cualquier usuario autenticado  
Lista los tickets del residente autenticado con datos de circuito y pago.

---

## Router: `usuarios`

### `usuarios.crearPerfil` — Mutation
**Roles:** cualquier usuario autenticado  
Crea el perfil de residente tras el registro.

**Input:**
```ts
{
  telefono:            string;         // mín. 10 dígitos
  sexo:                'masculino' | 'femenino' | 'otro';
  tenencia:            'propietario' | 'inquilino';
  circuitoId:          string (UUID);
  edificio:            string;
  departamento:        string;         // regex: /^\d+[a-zA-Z]?$/
  nombrePropietario?:  string;         // requerido si inquilino
  telefonoPropietario?: string;        // requerido si inquilino
}
```

### `usuarios.miPerfil` — Query
**Roles:** cualquier usuario autenticado  
Devuelve el perfil de residente del usuario autenticado.

### `usuarios.listarCircuitos` — Query
**Roles:** público  
Devuelve todos los circuitos activos (usado en el formulario de registro).

### `usuarios.listarResidentes` — Query
**Roles:** `admin`, `representante`  
Lista residentes con estado de pago del mes, datos de circuito y usuario.

### `usuarios.listarPersonal` — Query
**Roles:** `admin`, `representante`  
Lista el personal (no residentes) del sistema.

### `usuarios.cambiarRol` — Mutation
**Roles:** `admin`  
Cambia el rol de cualquier usuario.  
**Input:** `{ userId: string; rol: 'admin' | 'representante' | 'tesorera' | 'cuadrilla_cortes' | 'residente' }`

### `usuarios.cambiarRolEnCircuito` — Mutation
**Roles:** `representante`  
El representante puede cambiar roles dentro de su propio circuito.  
**Input:** `{ userId: string; rol: 'residente' | 'tesorera' | 'cuadrilla_cortes' }`

### `usuarios.asignarRepresentante` — Mutation
**Roles:** `admin`  
Asigna un representante a un circuito.  
**Input:** `{ circuitoId: string; userId: string }`

### `usuarios.crearRepresentante` / `actualizarRepresentante` / `eliminarRepresentante` — Mutations
**Roles:** `admin`  
CRUD de representantes. `eliminarRepresentante` realiza soft delete.

### `usuarios.crearTesorera` / `actualizarTesorera` / `eliminarTesorera` — Mutations
**Roles:** `admin`  
CRUD de tesoreras. `eliminarTesorera` realiza soft delete.

---

## Router: `circuitos`

### `circuitos.listar` — Query
**Roles:** `admin`  
Lista todos los circuitos con montos y estado.

### `circuitos.toggleActivo` — Mutation
**Roles:** `admin`  
Activa o desactiva un circuito.  
**Input:** `{ circuitoId: string; activo: boolean }`

### `circuitos.actualizarMontos` — Mutation
**Roles:** `admin`  
Actualiza la cuota mensual y el cargo de reconexión de un circuito.  
**Input:** `{ circuitoId: string; montoMensual: number; montoReconexion: number }`

### `circuitos.miCircuito` — Query
**Roles:** `representante`  
Devuelve el circuito asignado al representante autenticado.

### `circuitos.miCircuitoTesorera` — Query
**Roles:** `tesorera`  
Devuelve el circuito asignado a la tesorera autenticada.

---

## Router: `reportes`

Genera reportes financieros (Excel/PDF). Documentación pendiente de detalle específico de inputs/outputs.

**Roles:** `admin`, `representante`, `tesorera` (según el reporte)

---

## Endpoints REST (no tRPC)

| Método | Ruta                            | Descripción                             |
|--------|---------------------------------|-----------------------------------------|
| POST   | `/api/mercadopago/checkout`     | Crea preferencia de pago en MP          |
| POST   | `/api/mercadopago/webhook`      | Recibe notificaciones IPN de MP         |
| GET    | `/api/cron/cortes`              | Marca morosos y prepara cortes (cron)   |
| GET    | `/api/cron/limpiar-pendientes`  | Expira pagos pendientes >72h (cron)     |
| GET    | `/api/auth/[...all]`            | Better Auth — sign-in, sign-out, verify |
| GET    | `/api/trpc/[trpc]`              | tRPC endpoint                           |
