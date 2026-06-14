import { pgTable, uuid, text, integer, decimal,
         timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const rolEnum = pgEnum('rol', [
  'admin',
  'representante',
  'operador_pozo',
  'cuadrilla_cortes',
  'residente',
])

export const estadoPagoEnum = pgEnum('estado_pago', ['pendiente', 'pagado', 'vencido'])
export const tenenciaEnum   = pgEnum('tenencia', ['propietario', 'inquilino'])
export const sexoEnum       = pgEnum('sexo', ['masculino', 'femenino', 'otro'])

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
})

export const session = pgTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token:     text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId:    text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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
})

export const verification = pgTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').defaultNow(),
  updatedAt:  timestamp('updated_at').defaultNow(),
})

// ─────────────────────────────────────────────
// Estructura del fraccionamiento
// ─────────────────────────────────────────────
export const circuitos = pgTable('circuitos', {
  id:              uuid('id').defaultRandom().primaryKey(),
  nombre:          text('nombre').notNull(),
  representanteId: text('representante_id').references(() => user.id),
})

// Perfil extendido del residente — 1:1 con user
export const perfilesResidente = pgTable('perfiles_residente', {
  id:           uuid('id').defaultRandom().primaryKey(),
  userId:       text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  telefono:     text('telefono').notNull(),
  sexo:         sexoEnum('sexo').notNull(),
  tenencia:     tenenciaEnum('tenencia').notNull(),
  circuitoId:   uuid('circuito_id').notNull().references(() => circuitos.id),
  edificio:     text('edificio').notNull(),
  departamento: text('departamento').notNull(),
  estadoAgua:   text('estado_agua').notNull().default('activo'), // 'activo' | 'cortado'
  creadoEn:     timestamp('creado_en').defaultNow(),
})

// ─────────────────────────────────────────────
// Pagos, cortes y tickets
// ─────────────────────────────────────────────
export const pagos = pgTable('pagos', {
  id:           uuid('id').defaultRandom().primaryKey(),
  perfilId:     uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  mes:          integer('mes').notNull(),
  anio:         integer('anio').notNull(),
  monto:        decimal('monto', { precision: 10, scale: 2 }).notNull(),
  estado:       estadoPagoEnum('estado').default('pendiente'),
  metodo:       text('metodo'),
  folio:        text('folio').unique(),
  esReconexion: boolean('es_reconexion').default(false),
  fechaPago:    timestamp('fecha_pago'),
  creadoEn:     timestamp('creado_en').defaultNow(),
})

export const cortes = pgTable('cortes', {
  id:              uuid('id').defaultRandom().primaryKey(),
  perfilId:        uuid('perfil_id').references(() => perfilesResidente.id).notNull(),
  trabajadorId:    text('trabajador_id').references(() => user.id),
  motivo:          text('motivo').notNull(),
  activo:          boolean('activo').default(true),
  fechaCorte:      timestamp('fecha_corte').defaultNow(),
  fechaReconexion: timestamp('fecha_reconexion'),
  reconectadoPor:  text('reconectado_por').references(() => user.id),
})

export const tickets = pgTable('tickets', {
  id:        uuid('id').defaultRandom().primaryKey(),
  pagoId:    uuid('pago_id').references(() => pagos.id).notNull(),
  folio:     text('folio').notNull().unique(),
  qrCode:    text('qr_code'),
  pdfUrl:    text('pdf_url'),
  emitidoEn: timestamp('emitido_en').defaultNow(),
})

// ─────────────────────────────────────────────
// Relaciones
// ─────────────────────────────────────────────
export const userRelations = relations(user, ({ one, many }) => ({
  perfil: one(perfilesResidente, {
    fields: [user.id], references: [perfilesResidente.userId],
  }),
  circuitoRepresentado: many(circuitos),
}))

export const circuitosRelations = relations(circuitos, ({ many, one }) => ({
  perfiles: many(perfilesResidente),
  representante: one(user, {
    fields: [circuitos.representanteId],
    references: [user.id],
  }),
}))

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
}))

export const pagosRelations = relations(pagos, ({ one }) => ({
  perfil: one(perfilesResidente, {
    fields: [pagos.perfilId],
    references: [perfilesResidente.id],
  }),
  ticket: one(tickets, {
    fields: [pagos.id],
    references: [tickets.pagoId],
  }),
}))

export const cortesRelations = relations(cortes, ({ one }) => ({
  perfil: one(perfilesResidente, {
    fields: [cortes.perfilId],
    references: [perfilesResidente.id],
  }),
  trabajador: one(user, {
    fields: [cortes.trabajadorId],
    references: [user.id],
  }),
}))

export const ticketsRelations = relations(tickets, ({ one }) => ({
  pago: one(pagos, {
    fields: [tickets.pagoId],
    references: [pagos.id],
  }),
}))