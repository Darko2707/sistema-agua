// db/schema.ts
import { pgTable, uuid, text, integer, decimal, timestamp, boolean, pgEnum, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const rolEnum = pgEnum('rol', [
  'admin',
  'representante',
  'cuadrilla_cortes',
  'residente',
]);

export const estadoPagoEnum = pgEnum('estado_pago', ['pendiente', 'pagado', 'vencido']);
export const tenenciaEnum   = pgEnum('tenencia', ['propietario', 'inquilino']);
export const sexoEnum       = pgEnum('sexo', ['masculino', 'femenino', 'otro']);

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
});

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
});

// ─────────────────────────────────────────────
// Estructura del fraccionamiento
// ─────────────────────────────────────────────
export const circuitos = pgTable('circuitos', {
  id:                     uuid('id').defaultRandom().primaryKey(),
  nombre:                 text('nombre').notNull(),
  representanteId:        text('representante_id').references(() => user.id),
  montoMensual:           decimal('monto_mensual', { precision: 10, scale: 2 }).notNull().default('50.00'),
  montoReconexion:        decimal('monto_reconexion', { precision: 10, scale: 2 }).notNull().default('300.00'),
  mercadoPagoAccessToken: text('mercado_pago_access_token'),
  mercadoPagoCollectorId: text('mercado_pago_collector_id'),
  activo:                 boolean('activo').notNull().default(true), // ✅ NUEVO CAMPO AGREGADO AQUÍ
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
  index('idx_perfiles_circuito_estado').on(t.circuitoId, t.estadoAgua),
]);

// ─────────────────────────────────────────────
// Pagos, cortes y tickets
// ─────────────────────────────────────────────
export const pagos = pgTable('pagos', {
  id:                     uuid('id').defaultRandom().primaryKey(),
  perfilId:               uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  circuitoId:             uuid('circuito_id').references(() => circuitos.id),
  representanteId:        text('representante_id').references(() => user.id),
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
  metodo:                 text('metodo'),
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

  // Ordenamiento cronológico en listados admin.
  index('idx_pagos_creado_en').on(t.creadoEn),
]);

export const cortes = pgTable('cortes', {
  id:              uuid('id').defaultRandom().primaryKey(),
  perfilId:        uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  trabajadorId:    text('trabajador_id').references(() => user.id),
  motivo:          text('motivo').notNull(),
  activo:          boolean('activo').default(true),
  fechaCorte:      timestamp('fecha_corte').defaultNow(),
  fechaReconexion: timestamp('fecha_reconexion'),
  reconectadoPor:  text('reconectado_por').references(() => user.id),
});

export const tickets = pgTable('tickets', {
  id:        uuid('id').defaultRandom().primaryKey(),
  pagoId:    uuid('pago_id').references(() => pagos.id).notNull(),
  folio:     text('folio').notNull().unique(),
  qrCode:    text('qr_code'),
  pdfUrl:    text('pdf_url'),
  emitidoEn: timestamp('emitido_en').defaultNow(),
});

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