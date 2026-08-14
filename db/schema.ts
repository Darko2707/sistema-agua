// db/schema.ts
import { pgTable, uuid, text, integer, decimal, timestamp, boolean, pgEnum, uniqueIndex, index, jsonb, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const rolEnum = pgEnum('rol', [
  'admin',
  'representante',
  'tesorera',
  'cuadrilla_cortes',
  'residente',
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
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
});

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
  representanteId:        text('representante_id').references(() => user.id),
  tesoreraId:             text('tesorera_id').references(() => user.id),
  montoMensual:           decimal('monto_mensual', { precision: 10, scale: 2 }).notNull().default('50.00'),
  montoReconexion:        decimal('monto_reconexion', { precision: 10, scale: 2 }).notNull().default('300.00'),
  mercadoPagoAccessToken: text('mercado_pago_access_token'),
  mercadoPagoCollectorId: text('mercado_pago_collector_id'),
  activo:                 boolean('activo').notNull().default(true),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
});

// Perfil extendido del residente — 1:1 con user
export const perfilesResidente = pgTable('perfiles_residente', {
  id:           uuid('id').defaultRandom().primaryKey(),
  userId:       text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
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
  check('chk_perfiles_edificio_canonico', sql`${t.edificio} ~ '^[1-9][0-9]{0,5}$'`),
  check('chk_perfiles_departamento_canonico', sql`${t.departamento} ~ '^[1-9][0-9]{0,5}[A-Z]?$'`),
  index('idx_perfiles_circuito_estado').on(t.circuitoId, t.estadoAgua),
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
  perfilId:             uuid('perfil_id').notNull().references(() => perfilesResidente.id),
  circuitoId:           uuid('circuito_id').notNull().references(() => circuitos.id),
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
    sql`${t.externalReference} ~ '^agua_[a-f0-9]{48}$'`,
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
  index('idx_mp_payment_intents_expires_at').on(t.expiresAt),
  uniqueIndex('uq_mp_payment_intents_payment_id')
    .on(t.mercadoPagoPaymentId)
    .where(sql`${t.mercadoPagoPaymentId} IS NOT NULL`),
]);

export const pagos = pgTable('pagos', {
  id:                     uuid('id').defaultRandom().primaryKey(),
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
  pagoId:    uuid('pago_id').references(() => pagos.id).notNull(),
  folio:     text('folio').notNull().unique(),
  qrCode:    text('qr_code'),
  pdfUrl:    text('pdf_url'),
  emitidoEn: timestamp('emitido_en').defaultNow(),
}, (t) => [
  uniqueIndex('uq_tickets_pago_id').on(t.pagoId),
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

export const ticketsRelations = relations(tickets, ({ one }) => ({
  pago: one(pagos, {
    fields: [tickets.pagoId],
    references: [pagos.id],
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
