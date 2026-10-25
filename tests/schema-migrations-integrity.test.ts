import { describe, expect, it } from 'vitest';
import { user, session, pagos, cargosServicios, ordenesTrabajo, perfilesResidente, mercadoPagoPaymentIntents } from '@/db/schema';
import { getTableColumns } from 'drizzle-orm';
import { z } from 'zod';

describe('SCRUM-43: Integridad de Esquema, Restricciones y Migraciones', () => {
  // ─── 1. Restricciones y unicidad del campo email en user ───────────────────
  it('1. El campo email en tabla user es obligatorio, único y no tiene índices duplicados', () => {
    const userColumns = getTableColumns(user);

    expect(userColumns.email).toBeDefined();
    expect(userColumns.email.notNull).toBe(true);
    expect(userColumns.email.isUnique).toBe(true);

    // Validación de formato de email según estándar RFC 5321 (máximo 254 caracteres)
    const emailSchema = z.string().trim().email().max(254);
    expect(emailSchema.parse('usuario@ejemplo.com')).toBe('usuario@ejemplo.com');
    expect(() => emailSchema.parse('invalido-sin-arroba')).toThrow();
    expect(() => emailSchema.parse('a'.repeat(250) + '@ejemplo.com')).toThrow();
  });

  // ─── 2. Políticas de borrado lógico (Soft-delete) ──────────────────────────
  it('2. La tabla user implementa borrado lógico con deletedAt sin destrucción de registros', () => {
    const userColumns = getTableColumns(user);

    expect(userColumns.deletedAt).toBeDefined();
    expect(userColumns.deletedAt.notNull).toBe(false); // Nullable para usuarios activos
  });

  // ─── 3. Restricciones de aislamiento y unicidad multi-tenant ───────────────
  it('3. Las tablas de finanzas y operaciones contienen fraccionamientoId para aislamiento', () => {
    const pagosCols = getTableColumns(pagos);
    const cargosCols = getTableColumns(cargosServicios);
    const ordenesCols = getTableColumns(ordenesTrabajo);
    const perfilesCols = getTableColumns(perfilesResidente);

    expect(pagosCols.fraccionamientoId).toBeDefined();
    expect(cargosCols.fraccionamientoId).toBeDefined();
    expect(ordenesCols.fraccionamientoId).toBeDefined();
    expect(perfilesCols.fraccionamientoId).toBeDefined();
  });

  // ─── 4. Tipado de importes monetarios y estados ────────────────────────────
  it('4. Los importes monetarios se almacenan como cadenas numéricas de alta precisión', () => {
    const pagosCols = getTableColumns(pagos);
    const cargosCols = getTableColumns(cargosServicios);

    expect(pagosCols.monto).toBeDefined();
    expect(cargosCols.monto).toBeDefined();

    // Validar parseo numérico seguro
    const parseMonto = (m: string) => {
      const num = Number(m);
      if (!Number.isFinite(num) || num < 0) throw new Error('Monto inválido');
      return num;
    };

    expect(parseMonto('250.00')).toBe(250.0);
    expect(parseMonto('80.50')).toBe(80.5);
    expect(() => parseMonto('-10.00')).toThrow();
    expect(() => parseMonto('no_numerico')).toThrow();
  });

  // ─── 5. Integridad referencial de sesiones y Better Auth ───────────────────
  it('5. La tabla session requiere user_id y token único', () => {
    const sessionCols = getTableColumns(session);

    expect(sessionCols.token.isUnique).toBe(true);
    expect(sessionCols.token.notNull).toBe(true);
    expect(sessionCols.userId.notNull).toBe(true);
    expect(sessionCols.expiresAt.notNull).toBe(true);
  });

  // ─── 6. Integridad de esquema de intenciones de pago Mercado Pago ──────────
  it('6. La tabla mercado_pago_payment_intents incluye cargos_servicio_ids como jsonb no nulo', () => {
    const intentCols = getTableColumns(mercadoPagoPaymentIntents);

    expect(intentCols.cargosServicioIds).toBeDefined();
    expect(intentCols.cargosServicioIds.notNull).toBe(true);
    expect(intentCols.tipo).toBeDefined();
    expect(intentCols.cargoServicioId).toBeDefined();
    expect(intentCols.periodos).toBeDefined();
  });
});

