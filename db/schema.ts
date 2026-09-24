// db/schema.ts
import { pgTable, uuid, text, integer, decimal, timestamp, boolean, pgEnum, uniqueIndex, index, jsonb, check, foreignKey } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const rolEnum = pgEnum('rol', [
  'admin',
  'representante',
  'tesorera',
  'cuadrilla_cortes',
  'operador_pozo',
  'residente',
]);

export const estadoSuscripcionFraccionamientoEnum = pgEnum('estado_suscripcion_fraccionamiento', [
  'activa', 'gracia', 'vencida', 'suspendida', 'cancelada',
]);
export const estadoActivacionServicioEnum = pgEnum('estado_activacion_servicio', ['activo', 'inactivo']);
export const estadoSolicitudPerfilEnum = pgEnum('estado_solicitud_perfil', ['pendiente', 'aprobada', 'rechazada']);
export const estadoCargoServicioEnum = pgEnum('estado_cargo_servicio', ['pendiente', 'pagado', 'cancelado']);
export const rolAsignacionCircuitoEnum = pgEnum('rol_asignacion_circuito', ['cuadrilla_cortes', 'operador_pozo']);
export const mercadoPagoIntentTipoEnum = pgEnum('mercado_pago_intent_tipo', ['agua', 'servicio']);
export const ticketTipoEnum = pgEnum('ticket_tipo', ['agua', 'servicio']);
export const tipoOrdenTrabajoEnum = pgEnum('tipo_orden_trabajo', ['corte', 'reconexion']);
export const estadoOrdenTrabajoEnum = pgEnum('estado_orden_trabajo', [
  'pendiente',
  'asignada',
  'en_progreso',
  'completada',
  'cancelada',
]);

export const estadoPagoEnum = pgEnum('estado_pago', ['pendiente', 'pagado', 'vencido']);
export const tenenciaEnum   = pgEnum('tenencia', ['propietario', 'inquilino']);
export const sexoEnum       = pgEnum('sexo', ['masculino', 'femenino', 'otro']);
export const metodoPagoEnum = pgEnum('metodo_pago', ['efectivo', 'transferencia', 'mercado_pago']);
export const estadoNotificacionEnum = pgEnum('estado_notificacion', ['pendiente', 'enviada', 'fallida']);

// ============================================
// Estado del agua para perfiles
// ============================================
export const estadoAguaEnum = pgEnum('estado_agua', [
  'activo',             // pagando al corriente
  'pendiente_corte',    // debe el mes, cuadrilla debe ir a cortar
  'cortado',            // ya sin servicio, debe pagar reconexión
  'pendiente_reconexion',
]);

export const categoriaGastoEnum = pgEnum('categoria_gasto', [
  'mantenimiento',
  'administracion',
  'servicios',
  'otros',
]);

// ─────────────────────────────────────────────
// Better Auth — tablas requeridas
// ─────────────────────────────────────────────
export const user = pgTable('user', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image:         text('image'),
  role:          rolEnum('role').notNull().default('residente'),
  // Nullable para el admin global y durante el onboarding del residente;
  // el perfil terminado debe fijar exactamente un fraccionamiento.
  fraccionamientoId: uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('uq_user_single_global_admin').on(t.role).where(sql`${t.role} = 'admin' AND ${t.deletedAt} IS NULL`),
  index('idx_user_fraccionamiento_role').on(t.fraccionamientoId, t.role),
  uniqueIndex('uq_user_tenant_id').on(t.id, t.fraccionamientoId),
]);

export const session = pgTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token:     text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_session_user_id').on(t.userId),
]);

export const account = pgTable('account', {
  id:           text('id').primaryKey(),
  accountId:    text('account_id').notNull(),
  providerId:   text('provider_id').notNull(),
  userId:       text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken:  text('access_token'),
  refreshToken: text('refresh_token'),
  idToken:      text('id_token'),
  expiresAt:    timestamp('expires_at'),
  password:     text('password'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').defaultNow(),
  updatedAt:  timestamp('updated_at').defaultNow(),
}, (t) => [
  index('idx_verification_identifier').on(t.identifier),
]);

// ─────────────────────────────────────────────
// Estructura del fraccionamiento
// ─────────────────────────────────────────────
export const fraccionamientos = pgTable('fraccionamientos', {
  id:        uuid('id').defaultRandom().primaryKey(),
  nombre:    text('nombre').notNull(),
  slug:      text('slug').notNull().unique(),
  activo:    boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const suscripcionesFraccionamiento = pgTable('suscripciones_fraccionamiento', {
  id:                uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  plan:              text('plan').notNull().default('anual'),
  estado:            estadoSuscripcionFraccionamientoEnum('estado').notNull().default('activa'),
  vigenciaDesde:     timestamp('vigencia_desde').notNull(),
  vigenciaHasta:     timestamp('vigencia_hasta').notNull(),
  graciaHasta:       timestamp('gracia_hasta'),
  proveedor:         text('proveedor'),
  referenciaExterna: text('referencia_externa'),
  creadoEn:          timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn:     timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  check('suscripciones_fraccionamiento_plan_anual_chk', sql`${t.plan} = 'anual'`),
  check('suscripciones_fraccionamiento_fechas_chk', sql`${t.vigenciaHasta} > ${t.vigenciaDesde}`),
  check('suscripciones_fraccionamiento_gracia_chk', sql`${t.graciaHasta} IS NULL OR ${t.graciaHasta} >= ${t.vigenciaHasta}`),
  index('idx_suscripciones_fraccionamiento_estado').on(t.fraccionamientoId, t.estado, t.vigenciaHasta),
  uniqueIndex('uq_suscripciones_fraccionamiento_vigente')
    .on(t.fraccionamientoId)
    .where(sql`${t.estado} IN ('activa', 'gracia')`),
]);

export const servicios = pgTable('servicios', {
  id:             uuid('id').defaultRandom().primaryKey(),
  clave:          text('clave').notNull().unique(),
  nombre:         text('nombre').notNull(),
  cobroMensual:   boolean('cobro_mensual').notNull().default(true),
  conCorteFisico: boolean('con_corte_fisico').notNull().default(false),
  activo:         boolean('activo').notNull().default(true),
});

export const fraccionamientoServicios = pgTable('fraccionamiento_servicios', {
  id:                uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'cascade' }),
  servicioId:        uuid('servicio_id').notNull().references(() => servicios.id, { onDelete: 'restrict' }),
  estado:            estadoActivacionServicioEnum('estado').notNull().default('activo'),
  montoMensual:      decimal('monto_mensual', { precision: 10, scale: 2 }).notNull(),
  montoReconexion:   decimal('monto_reconexion', { precision: 10, scale: 2 }).notNull().default('0.00'),
  configuracion:     jsonb('configuracion').$type<Record<string, unknown>>(),
  creadoEn:          timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn:    timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fraccionamiento_servicios_unique').on(t.fraccionamientoId, t.servicioId),
  uniqueIndex('uq_fraccionamiento_servicios_tenant_id').on(t.id, t.fraccionamientoId),
  index('idx_fraccionamiento_servicios_estado').on(t.fraccionamientoId, t.estado),
  check('fraccionamiento_servicios_montos_chk', sql`${t.montoMensual} >= 0 AND ${t.montoReconexion} >= 0`),
]);

export const fraccionamientoMetodosPago = pgTable('fraccionamiento_metodos_pago', {
  id:                uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'cascade' }),
  proveedor:        text('proveedor').notNull().default('mercado_pago'),
  accessTokenCifrado:text('access_token_cifrado').notNull(),
  collectorId:      text('collector_id'),
  activo:           boolean('activo').notNull().default(true),
  creadoEn:         timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn:    timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('fraccionamiento_metodos_pago_unique').on(t.fraccionamientoId, t.proveedor),
]);

// Solicitudes iniciadas por el residente. Una solicitud pendiente se consume
// atomicamente al generar el codigo; por eso el representante no puede emitir
// dos codigos para la misma solicitud ni generar uno sin peticion previa.
export const passwordResetRequests = pgTable('password_reset_requests', {
  id:          uuid('id').defaultRandom().primaryKey(),
  userId:      text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  perfilId:    uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  generatedAt: timestamp('generated_at'),
  generatedBy: text('generated_by').references(() => user.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('uq_password_reset_requests_user_pending')
    .on(t.userId)
    .where(sql`${t.generatedAt} IS NULL`),
  index('idx_password_reset_requests_pending_profile')
    .on(t.perfilId, t.requestedAt)
    .where(sql`${t.generatedAt} IS NULL`),
  check(
    'chk_password_reset_requests_generated_by_state',
    sql`${t.generatedAt} IS NOT NULL OR ${t.generatedBy} IS NULL`,
  ),
]);

// Codigos temporales que un representante entrega en persona para recuperar
// una cuenta sin depender de correo/SMS. Se guarda solo el hash del codigo.
export const passwordResetCodes = pgTable('password_reset_codes', {
  id:              uuid('id').defaultRandom().primaryKey(),
  userId:          text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  perfilId:        uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  representanteId: text('representante_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  codeHash:        text('code_hash').notNull(),
  attempts:        integer('attempts').notNull().default(0),
  expiresAt:       timestamp('expires_at').notNull(),
  usedAt:          timestamp('used_at'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_password_reset_codes_user_active')
    .on(t.userId, t.expiresAt)
    .where(sql`${t.usedAt} IS NULL`),
  index('idx_password_reset_codes_representante').on(t.representanteId, t.createdAt),
]);
export const circuitos = pgTable('circuitos', {
  id:                     uuid('id').defaultRandom().primaryKey(),
  nombre:                 text('nombre').notNull(),
  // Nullable during the backfill window; migration 0024 enforces NOT NULL in DB.
  // Nullable in the TypeScript model for isolated legacy/integration fixtures;
  // migration 0030 enforces NOT NULL in the production database after backfill.
  fraccionamientoId:      uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  representanteId:        text('representante_id').references(() => user.id),
  tesoreraId:             text('tesorera_id').references(() => user.id),
  montoMensual:           decimal('monto_mensual', { precision: 10, scale: 2 }).notNull().default('50.00'),
  montoReconexion:        decimal('monto_reconexion', { precision: 10, scale: 2 }).notNull().default('300.00'),
  mercadoPagoAccessToken: text('mercado_pago_access_token'),
  mercadoPagoCollectorId: text('mercado_pago_collector_id'),
  activo:                 boolean('activo').notNull().default(true),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_circuitos_fraccionamiento').on(t.fraccionamientoId),
  uniqueIndex('uq_circuitos_representante_unico').on(t.representanteId).where(sql`${t.representanteId} IS NOT NULL`),
  uniqueIndex('uq_circuitos_tesorera_unica').on(t.tesoreraId).where(sql`${t.tesoreraId} IS NOT NULL`),
  uniqueIndex('uq_circuitos_tenant_nombre').on(t.fraccionamientoId, t.nombre),
  uniqueIndex('uq_circuitos_tenant_id').on(t.id, t.fraccionamientoId),
]);

// Asignaciones explícitas para personal operativo. Un usuario puede tener
// varios circuitos, pero únicamente dentro de su propio fraccionamiento.
export const asignacionesCircuito = pgTable('asignaciones_circuito', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: text('usuario_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  fraccionamientoId: uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  circuitoId: uuid('circuito_id').notNull().references(() => circuitos.id, { onDelete: 'cascade' }),
  fraccionamientoServicioId: uuid('fraccionamiento_servicio_id').notNull().references(() => fraccionamientoServicios.id, { onDelete: 'restrict' }),
  rol: rolAsignacionCircuitoEnum('rol').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_asignacion_circuito_persona').on(t.usuarioId, t.circuitoId, t.fraccionamientoServicioId, t.rol),
  index('idx_asignaciones_circuito_tenant').on(t.fraccionamientoId, t.circuitoId, t.activo),
  index('idx_asignaciones_circuito_usuario').on(t.usuarioId, t.activo),
  foreignKey({ columns: [t.usuarioId, t.fraccionamientoId], foreignColumns: [user.id, user.fraccionamientoId], name: 'asignaciones_circuito_usuario_tenant_fk' }),
  foreignKey({ columns: [t.circuitoId, t.fraccionamientoId], foreignColumns: [circuitos.id, circuitos.fraccionamientoId], name: 'asignaciones_circuito_circuito_tenant_fk' }),
  foreignKey({ columns: [t.fraccionamientoServicioId, t.fraccionamientoId], foreignColumns: [fraccionamientoServicios.id, fraccionamientoServicios.fraccionamientoId], name: 'asignaciones_circuito_servicio_tenant_fk' }),
]);

// Perfil extendido del residente — 1:1 con user
export const perfilesResidente = pgTable('perfiles_residente', {
  id:           uuid('id').defaultRandom().primaryKey(),
  userId:       text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  // Migration 0030 makes this column NOT NULL after validating legacy rows.
  fraccionamientoId: uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  telefono:     text('telefono').notNull(),
  sexo:         sexoEnum('sexo').notNull(),
  tenencia:     tenenciaEnum('tenencia').notNull(),
  circuitoId:   uuid('circuito_id').notNull().references(() => circuitos.id),
  edificio:             text('edificio').notNull(),
  departamento:         text('departamento').notNull(),
  nombrePropietario:    text('nombre_propietario'),
  telefonoPropietario:  text('telefono_propietario'),
  estadoAgua:   estadoAguaEnum('estado_agua').notNull().default('activo'),
  creadoEn:     timestamp('creado_en').defaultNow(),
}, (t) => [
  // Dashboard: listar residentes por circuito; filtrar pendientes de corte/reconexión
  // Defensa final ante altas simultaneas de la misma vivienda.
  uniqueIndex('uq_perfiles_residente_ubicacion')
    .on(t.circuitoId, t.edificio, t.departamento),
  uniqueIndex('uq_perfiles_residente_tenant_id').on(t.id, t.fraccionamientoId),
  foreignKey({ columns: [t.circuitoId, t.fraccionamientoId], foreignColumns: [circuitos.id, circuitos.fraccionamientoId], name: 'perfiles_circuito_mismo_fraccionamiento_fk' }),
  check('chk_perfiles_edificio_canonico', sql`${t.edificio} ~ '^[1-9][0-9]{0,5}$'`),
  check('chk_perfiles_departamento_canonico', sql`${t.departamento} ~ '^[1-9][0-9]{0,5}[A-Z]?$'`),
  index('idx_perfiles_circuito_estado').on(t.circuitoId, t.estadoAgua),
]);

export const perfilesServicios = pgTable('perfiles_servicios', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  perfilId:             uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  fraccionamientoId:    uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  fraccionamientoServicioId: uuid('fraccionamiento_servicio_id').notNull().references(() => fraccionamientoServicios.id, { onDelete: 'restrict' }),
  estadoAgua:           estadoAguaEnum('estado_agua').notNull().default('activo'),
  activo:               boolean('activo').notNull().default(true),
  creadoEn:             timestamp('creado_en').notNull().defaultNow(),
  actualizadoEn:       timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_perfiles_servicios_perfil_servicio').on(t.perfilId, t.fraccionamientoServicioId),
  index('idx_perfiles_servicios_tenant_estado').on(t.fraccionamientoId, t.estadoAgua),
  index('idx_perfiles_servicios_activo_tenant').on(t.fraccionamientoId, t.activo, t.fraccionamientoServicioId),
]);

export const cargosServicios = pgTable('cargos_servicios', {
  id: uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  perfilId: uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'restrict' }),
  fraccionamientoServicioId: uuid('fraccionamiento_servicio_id').notNull().references(() => fraccionamientoServicios.id, { onDelete: 'restrict' }),
  mes: integer('mes').notNull(),
  anio: integer('anio').notNull(),
  monto: decimal('monto', { precision: 10, scale: 2 }).notNull(),
  estado: estadoCargoServicioEnum('estado').notNull().default('pendiente'),
  metodo: metodoPagoEnum('metodo'),
  mercadoPagoPaymentId: text('mercado_pago_payment_id'),
  folio: text('folio').unique(),
  creadoEn: timestamp('creado_en').notNull().defaultNow(),
  pagadoEn: timestamp('pagado_en'),
}, (t) => [
  uniqueIndex('uq_cargos_servicio_periodo').on(t.perfilId, t.fraccionamientoServicioId, t.mes, t.anio),
  uniqueIndex('uq_cargos_servicios_id_tenant').on(t.id, t.fraccionamientoId),
  // Un pago de Mercado Pago solo puede acreditar un cargo de servicio.
  // El índice parcial permite que los cargos pendientes sigan sin paymentId.
  uniqueIndex('uq_cargos_servicios_mp_payment_id')
    .on(t.mercadoPagoPaymentId)
    .where(sql`${t.mercadoPagoPaymentId} IS NOT NULL`),
  index('idx_cargos_servicio_tenant_periodo').on(t.fraccionamientoId, t.mes, t.anio, t.estado),
  index('idx_cargos_servicio_perfil_estado').on(t.perfilId, t.estado),
  check('chk_cargos_servicio_mes', sql`${t.mes} BETWEEN 1 AND 12`),
  check('chk_cargos_servicio_anio', sql`${t.anio} BETWEEN 2020 AND 2100`),
  check('chk_cargos_servicio_monto', sql`${t.monto} >= 0`),
]);

export const solicitudesCambioPerfil = pgTable('solicitudes_cambio_perfil', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  perfilId:             uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  fraccionamientoId:    uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  solicitanteId:        text('solicitante_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  aprobadorId:          text('aprobador_id').references(() => user.id, { onDelete: 'set null' }),
  estado:               estadoSolicitudPerfilEnum('estado').notNull().default('pendiente'),
  valoresAnteriores:    jsonb('valores_anteriores').notNull().$type<Record<string, unknown>>(),
  valoresNuevos:        jsonb('valores_nuevos').notNull().$type<Record<string, unknown>>(),
  motivo:               text('motivo').notNull(),
  solicitadoEn:         timestamp('solicitado_en').notNull().defaultNow(),
  resueltoEn:           timestamp('resuelto_en'),
  }, (t) => [
    uniqueIndex('uq_solicitudes_cambio_perfil_pendiente')
      .on(t.perfilId)
      .where(sql`${t.estado} = 'pendiente'`),
    index('idx_solicitudes_cambio_perfil_tenant_estado').on(t.fraccionamientoId, t.estado, t.solicitadoEn),
  index('idx_solicitudes_cambio_perfil_perfil').on(t.perfilId, t.solicitadoEn),
]);

// ─────────────────────────────────────────────
// Pagos, cortes y tickets
// ─────────────────────────────────────────────
export type MercadoPagoPaymentIntentPeriodo = {
  mes: number;
  anio: number;
  monto: string;
  esReconexion: boolean;
};

export const mercadoPagoPaymentIntents = pgTable('mercado_pago_payment_intents', {
  externalReference:    text('external_reference').primaryKey(),
  tipo:                 mercadoPagoIntentTipoEnum('tipo').notNull().default('agua'),
  fraccionamientoId:    uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  perfilId:             uuid('perfil_id').notNull().references(() => perfilesResidente.id),
  circuitoId:           uuid('circuito_id').notNull().references(() => circuitos.id),
  cargoServicioId:      uuid('cargo_servicio_id').references(() => cargosServicios.id, { onDelete: 'restrict' }),
  periodos:             jsonb('periodos').$type<MercadoPagoPaymentIntentPeriodo[]>().notNull(),
  total:                decimal('total', { precision: 10, scale: 2 }).notNull(),
  currency:             text('currency').notNull().default('MXN'),
  collectorId:          text('collector_id'),
  expiresAt:            timestamp('expires_at').notNull(),
  mercadoPagoPaymentId: text('mercado_pago_payment_id'),
  consumedAt:           timestamp('consumed_at'),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  check(
    'chk_mp_payment_intents_external_reference',
    sql`(${t.tipo} = 'agua' AND ${t.externalReference} ~ '^agua_[a-f0-9]{48}$' AND ${t.cargoServicioId} IS NULL)
      OR (${t.tipo} = 'servicio' AND ${t.externalReference} ~ '^serv_[0-9a-f-]{36}$' AND ${t.cargoServicioId} IS NOT NULL)`,
  ),
  check('chk_mp_payment_intents_currency', sql`${t.currency} = 'MXN'`),
  check('chk_mp_payment_intents_total_positive', sql`${t.total} > 0`),
  check(
    'chk_mp_payment_intents_periodos_count',
    sql`jsonb_typeof(${t.periodos}) = 'array' AND jsonb_array_length(${t.periodos}) BETWEEN 1 AND 12`,
  ),
  check(
    'chk_mp_payment_intents_consumption',
    sql`(${t.mercadoPagoPaymentId} IS NULL AND ${t.consumedAt} IS NULL)
      OR (${t.mercadoPagoPaymentId} IS NOT NULL AND ${t.consumedAt} IS NOT NULL)`,
  ),
  index('idx_mp_payment_intents_perfil_created').on(t.perfilId, t.createdAt),
  index('idx_mp_payment_intents_cargo_servicio').on(t.cargoServicioId),
  index('idx_mp_payment_intents_expires_at').on(t.expiresAt),
  uniqueIndex('uq_mp_payment_intents_payment_id')
    .on(t.mercadoPagoPaymentId)
    .where(sql`${t.mercadoPagoPaymentId} IS NOT NULL`),
]);

export const pagos = pgTable('pagos', {
  id:                     uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId:      uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  perfilId:               uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  circuitoId:             uuid('circuito_id').references(() => circuitos.id).notNull(),
  representanteId:        text('representante_id').references(() => user.id, { onDelete: 'set null' }),
  mes:                    integer('mes').notNull(),
  anio:                   integer('anio').notNull(),
  monto:                  decimal('monto', { precision: 10, scale: 2 }).notNull(),
  montoBase:              decimal('monto_base', { precision: 10, scale: 2 }).default('0.00'),
  iva:                    decimal('iva', { precision: 10, scale: 2 }).default('0.00'),
  comisionMercadoPago:    decimal('comision_mercado_pago', { precision: 10, scale: 2 }).default('0.00'),
  retencionIsr:           decimal('retencion_isr', { precision: 10, scale: 2 }).default('0.00'),
  retencionIva:           decimal('retencion_iva', { precision: 10, scale: 2 }).default('0.00'),
  montoNetoRepresentante: decimal('monto_neto_representante', { precision: 10, scale: 2 }).default('0.00'),
  mercadoPagoPaymentId:   text('mercado_pago_payment_id'),
  mercadoPagoCollectorId: text('mercado_pago_collector_id'),
  estado:                 estadoPagoEnum('estado').default('pendiente'),
  metodo:                 metodoPagoEnum('metodo'),
  folio:                  text('folio').unique(),
  esReconexion:           boolean('es_reconexion').default(false),
  fechaPago:              timestamp('fecha_pago'),
  creadoEn:               timestamp('creado_en').defaultNow(),
}, (t) => [
  // Unicidad: un residente solo puede tener un pago 'pagado' por mes/año.
  // Índice parcial → no bloquea registros pendientes/vencidos.
  uniqueIndex('idx_pagos_pagado_por_mes')
    .on(t.perfilId, t.mes, t.anio)
    .where(sql`${t.estado} = 'pagado'`),

  // Historial completo de un residente (miHistorial, historialDe).
  // El índice parcial de arriba no cubre búsquedas sin filtro de estado.
  index('idx_pagos_perfil_periodo').on(t.perfilId, t.mes, t.anio),

  // Reportes financieros y de residentes filtran por circuito y periodo.
  index('idx_pagos_circuito_periodo').on(t.circuitoId, t.mes, t.anio),

  // Ordenamiento cronológico en listados admin.
  index('idx_pagos_creado_en').on(t.creadoEn),

  // Idempotencia y conciliacion de lotes de Mercado Pago (un paymentId puede
  // cubrir varios meses del mismo residente).
  index('idx_pagos_mp_payment_id').on(t.mercadoPagoPaymentId),

  // Cron limpiar-pendientes: WHERE estado='pendiente' AND creado_en < X
  // El índice parcial evita full-scan de toda la tabla cada madrugada.
  index('idx_pagos_pendiente_creado')
    .on(t.creadoEn)
    .where(sql`${t.estado} = 'pendiente'`),

  // Dashboard de métricas: WHERE fecha_pago >= hace30dias AND estado='pagado'
  // También cubre ORDER BY fecha_pago DESC en findAllPagadosPorMes.
  index('idx_pagos_fecha_pago').on(t.fechaPago),
]);

export const cortes = pgTable('cortes', {
  id:              uuid('id').defaultRandom().primaryKey(),
  perfilId:        uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  trabajadorId:    text('trabajador_id').references(() => user.id).notNull(),
  motivo:          text('motivo').notNull(),
  activo:          boolean('activo').default(true),
  fechaCorte:      timestamp('fecha_corte').defaultNow(),
  fechaReconexion: timestamp('fecha_reconexion'),
  reconectadoPor:  text('reconectado_por').references(() => user.id),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_cortes_perfil_activo')
    .on(t.perfilId)
    .where(sql`${t.activo} = true`),
]);

export const tickets = pgTable('tickets', {
  id:        uuid('id').defaultRandom().primaryKey(),
  // Un ticket respalda un pago legado de agua o un cargo del catálogo de
  // servicios; la migración agrega el CHECK de exclusión mutua.
  pagoId:    uuid('pago_id').references(() => pagos.id),
  cargoServicioId: uuid('cargo_servicio_id').references(() => cargosServicios.id, { onDelete: 'restrict' }),
  tipo:      ticketTipoEnum('tipo').notNull().default('agua'),
  folio:     text('folio').notNull().unique(),
  qrCode:    text('qr_code'),
  pdfUrl:    text('pdf_url'),
  emitidoEn: timestamp('emitido_en').defaultNow(),
}, (t) => [
  uniqueIndex('uq_tickets_pago_id').on(t.pagoId).where(sql`${t.pagoId} IS NOT NULL`),
  uniqueIndex('uq_tickets_cargo_servicio_id').on(t.cargoServicioId).where(sql`${t.cargoServicioId} IS NOT NULL`),
  check('chk_ticket_referencia_tipo', sql`
    (${t.tipo} = 'agua' AND ${t.pagoId} IS NOT NULL AND ${t.cargoServicioId} IS NULL)
    OR (${t.tipo} = 'servicio' AND ${t.pagoId} IS NULL AND ${t.cargoServicioId} IS NOT NULL)
  `),
]);

export const auditoria = pgTable('auditoria', {
  id:        uuid('id').defaultRandom().primaryKey(),
  actorId:   text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  accion:    text('accion').notNull(),
  entidad:   text('entidad').notNull(),
  entidadId: text('entidad_id'),
  detalle:   jsonb('detalle').$type<Record<string, unknown>>(),
  ip:        text('ip'),
  userAgent: text('user_agent'),
  creadoEn:  timestamp('creado_en').notNull().defaultNow(),
}, (t) => [
  index('idx_auditoria_entidad').on(t.entidad, t.entidadId),
  index('idx_auditoria_creado_en').on(t.creadoEn),
]);

export const reversosPago = pgTable('reversos_pago', {
  id:            uuid('id').defaultRandom().primaryKey(),
  pagoId:        uuid('pago_id').notNull().references(() => pagos.id, { onDelete: 'restrict' }),
  actorId:       text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  motivo:        text('motivo').notNull(),
  estadoAnterior:text('estado_anterior').notNull(),
  creadoEn:      timestamp('creado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_reversos_pago_pago_id').on(t.pagoId),
  index('idx_reversos_actor').on(t.actorId),
]);

export const consentimientosLegales = pgTable('consentimientos_legales', {
  id:                 uuid('id').defaultRandom().primaryKey(),
  userId:             text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  privacidadVersion:  text('privacidad_version').notNull(),
  cookiesVersion:     text('cookies_version').notNull(),
  terminosVersion:    text('terminos_version').notNull(),
  ip:                 text('ip'),
  userAgent:          text('user_agent'),
  aceptadoEn:         timestamp('aceptado_en').notNull().defaultNow(),
}, (t) => [
  index('idx_consentimientos_user').on(t.userId),
]);

export const bitacoraCortes = pgTable('bitacora_cortes', {
  id:        uuid('id').defaultRandom().primaryKey(),
  corteId:   uuid('corte_id').references(() => cortes.id, { onDelete: 'set null' }),
  perfilId:  uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  actorId:   text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  accion:    text('accion').notNull(),
  nota:      text('nota'),
  fotoUrl:   text('foto_url'),
  creadoEn:  timestamp('creado_en').notNull().defaultNow(),
}, (t) => [
  index('idx_bitacora_cortes_perfil').on(t.perfilId),
  index('idx_bitacora_cortes_corte').on(t.corteId),
]);

// Una orden representa el trabajo operativo que debe realizarse. `cortes`
// conserva exclusivamente el resultado físico (histórico); no se usa como
// cola de trabajo ni como mecanismo de asignación.
export const ordenesTrabajo = pgTable('ordenes_trabajo', {
  id: uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').notNull().references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  circuitoId: uuid('circuito_id').notNull().references(() => circuitos.id, { onDelete: 'restrict' }),
  perfilId: uuid('perfil_id').notNull().references(() => perfilesResidente.id, { onDelete: 'restrict' }),
  fraccionamientoServicioId: uuid('fraccionamiento_servicio_id').notNull().references(() => fraccionamientoServicios.id, { onDelete: 'restrict' }),
  tipo: tipoOrdenTrabajoEnum('tipo').notNull(),
  estado: estadoOrdenTrabajoEnum('estado').notNull().default('pendiente'),
  trabajadorId: text('trabajador_id').references(() => user.id, { onDelete: 'set null' }),
  creadoPor: text('creado_por').references(() => user.id, { onDelete: 'set null' }),
  ejecutadoPor: text('ejecutado_por').references(() => user.id, { onDelete: 'set null' }),
  corteId: uuid('corte_id').references(() => cortes.id, { onDelete: 'set null' }),
  motivo: text('motivo').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  notas: text('notas'),
  creadoEn: timestamp('creado_en').notNull().defaultNow(),
  asignadoEn: timestamp('asignado_en'),
  iniciadoEn: timestamp('iniciado_en'),
  completadoEn: timestamp('completado_en'),
  canceladoEn: timestamp('cancelado_en'),
  actualizadoEn: timestamp('actualizado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_ordenes_trabajo_idempotency').on(t.idempotencyKey),
  uniqueIndex('uq_ordenes_trabajo_activa')
    .on(t.perfilId, t.fraccionamientoServicioId, t.tipo)
    .where(sql`${t.estado} IN ('pendiente', 'asignada', 'en_progreso')`),
  index('idx_ordenes_trabajo_tenant_estado').on(t.fraccionamientoId, t.estado, t.creadoEn),
  index('idx_ordenes_trabajo_circuito_estado').on(t.circuitoId, t.estado, t.creadoEn),
  index('idx_ordenes_trabajo_trabajador_estado').on(t.trabajadorId, t.estado, t.creadoEn),
  index('idx_ordenes_trabajo_perfil').on(t.perfilId, t.creadoEn),
]);

export const notificaciones = pgTable('notificaciones', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    text('user_id').references(() => user.id, { onDelete: 'set null' }),
  perfilId:  uuid('perfil_id').references(() => perfilesResidente.id, { onDelete: 'cascade' }),
  dedupeKey: text('dedupe_key'),
  canal:     text('canal').notNull(),
  tipo:      text('tipo').notNull(),
  destino:   text('destino').notNull(),
  mensaje:   text('mensaje').notNull(),
  estado:    estadoNotificacionEnum('estado').notNull().default('pendiente'),
  error:     text('error'),
  expiresAt: timestamp('expires_at'),
  enviadoEn: timestamp('enviado_en'),
  creadoEn:  timestamp('creado_en').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_notificaciones_dedupe_key').on(t.dedupeKey),
  index('idx_notificaciones_estado').on(t.estado),
  index('idx_notificaciones_user').on(t.userId),
  index('idx_notificaciones_push_ready')
    .on(t.creadoEn)
    .where(sql`${t.estado} = 'pendiente' AND ${t.canal} = 'push'`),
]);

// Una suscripcion pertenece a un navegador/dispositivo, no a una vivienda.
// El endpoint es un secreto de capacidad: nunca se expone en reportes o bitacoras.
export const pushSubscriptions = pgTable('push_subscriptions', {
  id:             uuid('id').defaultRandom().primaryKey(),
  userId:         text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  endpointHash:   text('endpoint_hash').notNull(),
  endpoint:       text('endpoint').notNull(),
  p256dh:         text('p256dh').notNull(),
  auth:           text('auth').notNull(),
  expirationTime: timestamp('expiration_time'),
  userAgent:      text('user_agent'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_push_subscriptions_endpoint_hash').on(t.endpointHash),
  index('idx_push_subscriptions_user').on(t.userId),
]);

// Estado independiente por dispositivo: si uno falla, los que ya recibieron el
// aviso no vuelven a recibirlo durante el reintento.
export const pushDeliveries = pgTable('push_deliveries', {
  id:             uuid('id').defaultRandom().primaryKey(),
  notificationId: uuid('notification_id').notNull().references(() => notificaciones.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => pushSubscriptions.id, { onDelete: 'set null' }),
  estado:         estadoNotificacionEnum('estado').notNull().default('pendiente'),
  attempts:       integer('attempts').notNull().default(0),
  nextAttemptAt:  timestamp('next_attempt_at').notNull().defaultNow(),
  lockedAt:       timestamp('locked_at'),
  lastError:      text('last_error'),
  sentAt:         timestamp('sent_at'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_push_deliveries_notification_subscription').on(t.notificationId, t.subscriptionId),
  index('idx_push_deliveries_ready').on(t.estado, t.nextAttemptAt),
  index('idx_push_deliveries_notification').on(t.notificationId),
  index('idx_push_deliveries_subscription').on(t.subscriptionId),
]);

export const ingresosAdicionales = pgTable('ingresos_adicionales', {
  id:              uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  circuitoId:      uuid('circuito_id').notNull().references(() => circuitos.id, { onDelete: 'cascade' }),
  representanteId: text('representante_id').notNull().references(() => user.id),
  concepto:        text('concepto').notNull(),
  monto:           decimal('monto', { precision: 10, scale: 2 }).notNull(),
  fecha:           timestamp('fecha').notNull().defaultNow(),
  mes:             integer('mes').notNull(),
  anio:            integer('anio').notNull(),
  creadoEn:        timestamp('creado_en').defaultNow(),
}, (t) => [
  index('idx_ingresos_circuito_periodo').on(t.circuitoId, t.mes, t.anio),
]);

export const gastosCircuito = pgTable('gastos_circuito', {
  id:              uuid('id').defaultRandom().primaryKey(),
  fraccionamientoId: uuid('fraccionamiento_id').references(() => fraccionamientos.id, { onDelete: 'restrict' }),
  circuitoId:      uuid('circuito_id').notNull().references(() => circuitos.id, { onDelete: 'cascade' }),
  representanteId: text('representante_id').notNull().references(() => user.id),
  concepto:        text('concepto').notNull(),
  monto:           decimal('monto', { precision: 10, scale: 2 }).notNull(),
  categoria:       categoriaGastoEnum('categoria').notNull().default('otros'),
  fecha:           timestamp('fecha').notNull().defaultNow(),
  mes:             integer('mes').notNull(),
  anio:            integer('anio').notNull(),
  creadoEn:        timestamp('creado_en').defaultNow(),
}, (t) => [
  index('idx_gastos_circuito_periodo').on(t.circuitoId, t.mes, t.anio),
]);

// ─────────────────────────────────────────────
// Relaciones
// ─────────────────────────────────────────────
export const userRelations = relations(user, ({ one, many }) => ({
  perfil: one(perfilesResidente, {
    fields: [user.id], references: [perfilesResidente.userId],
  }),
  circuitoRepresentado: many(circuitos),
  pushSubscriptions: many(pushSubscriptions),
}));

export const ingresosAdicionalesRelations = relations(ingresosAdicionales, ({ one }) => ({
  circuito: one(circuitos, {
    fields: [ingresosAdicionales.circuitoId],
    references: [circuitos.id],
  }),
}));

export const circuitosRelations = relations(circuitos, ({ many, one }) => ({
  perfiles:  many(perfilesResidente),
  gastos:    many(gastosCircuito),
  ingresos:  many(ingresosAdicionales),
  representante: one(user, {
    fields: [circuitos.representanteId],
    references: [user.id],
  }),
}));

export const gastosCircuitoRelations = relations(gastosCircuito, ({ one }) => ({
  circuito: one(circuitos, {
    fields: [gastosCircuito.circuitoId],
    references: [circuitos.id],
  }),
  representante: one(user, {
    fields: [gastosCircuito.representanteId],
    references: [user.id],
  }),
}));

export const perfilesResidenteRelations = relations(perfilesResidente, ({ one, many }) => ({
  usuario: one(user, {
    fields: [perfilesResidente.userId],
    references: [user.id],
  }),
  circuito: one(circuitos, {
    fields: [perfilesResidente.circuitoId],
    references: [circuitos.id],
  }),
  pagos:  many(pagos),
  cortes: many(cortes),
  ordenesTrabajo: many(ordenesTrabajo),
}));

export const pagosRelations = relations(pagos, ({ one }) => ({
  perfil: one(perfilesResidente, {
    fields: [pagos.perfilId],
    references: [perfilesResidente.id],
  }),
  circuito: one(circuitos, {
    fields: [pagos.circuitoId],
    references: [circuitos.id],
  }),
  representante: one(user, {
    fields: [pagos.representanteId],
    references: [user.id],
  }),
  ticket: one(tickets, {
    fields: [pagos.id],
    references: [tickets.pagoId],
  }),
}));

export const cortesRelations = relations(cortes, ({ one }) => ({
  perfil: one(perfilesResidente, {
    fields: [cortes.perfilId],
    references: [perfilesResidente.id],
  }),
  trabajador: one(user, {
    fields: [cortes.trabajadorId],
    references: [user.id],
  }),
}));

export const ordenesTrabajoRelations = relations(ordenesTrabajo, ({ one }) => ({
  fraccionamiento: one(fraccionamientos, {
    fields: [ordenesTrabajo.fraccionamientoId],
    references: [fraccionamientos.id],
  }),
  circuito: one(circuitos, {
    fields: [ordenesTrabajo.circuitoId],
    references: [circuitos.id],
  }),
  perfil: one(perfilesResidente, {
    fields: [ordenesTrabajo.perfilId],
    references: [perfilesResidente.id],
  }),
  servicio: one(fraccionamientoServicios, {
    fields: [ordenesTrabajo.fraccionamientoServicioId],
    references: [fraccionamientoServicios.id],
  }),
  trabajador: one(user, {
    fields: [ordenesTrabajo.trabajadorId],
    references: [user.id],
  }),
  creador: one(user, {
    fields: [ordenesTrabajo.creadoPor],
    references: [user.id],
  }),
  ejecutor: one(user, {
    fields: [ordenesTrabajo.ejecutadoPor],
    references: [user.id],
  }),
  corte: one(cortes, {
    fields: [ordenesTrabajo.corteId],
    references: [cortes.id],
  }),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  pago: one(pagos, {
    fields: [tickets.pagoId],
    references: [pagos.id],
  }),
  cargoServicio: one(cargosServicios, {
    fields: [tickets.cargoServicioId],
    references: [cargosServicios.id],
  }),
}));

export const notificacionesRelations = relations(notificaciones, ({ one, many }) => ({
  usuario: one(user, {
    fields: [notificaciones.userId],
    references: [user.id],
  }),
  perfil: one(perfilesResidente, {
    fields: [notificaciones.perfilId],
    references: [perfilesResidente.id],
  }),
  entregasPush: many(pushDeliveries),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one, many }) => ({
  usuario: one(user, {
    fields: [pushSubscriptions.userId],
    references: [user.id],
  }),
  entregas: many(pushDeliveries),
}));

export const pushDeliveriesRelations = relations(pushDeliveries, ({ one }) => ({
  notificacion: one(notificaciones, {
    fields: [pushDeliveries.notificationId],
    references: [notificaciones.id],
  }),
  suscripcion: one(pushSubscriptions, {
    fields: [pushDeliveries.subscriptionId],
    references: [pushSubscriptions.id],
  }),
}));
