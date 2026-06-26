/**
 * Integration tests — checkout flow with real Neon DB
 *
 * Run with:
 *   npx vitest run --config vitest.integration.config.ts
 *
 * These tests use the DATABASE_URL from .env.local.
 * All test data uses year 2090 for payments and unique nanoid-suffixed IDs
 * so they never conflict with production rows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import { eq, and, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { user, circuitos, perfilesResidente, pagos, tickets } from '@/db/schema';
import { ProcesarPagoMpHandler } from '@/src/application/pagos/commands/procesar-pago-mp.handler';
import { residenteRepo, pagoRepo, circuitoRepo } from '@/src/infrastructure/db/repositories';
import { parseExternalReference } from '@/src/infrastructure/mercadopago/parser';

// ── Fixtures ───────────────────────────────────────────────────────────────────
const suffix = nanoid(8);

const FX = {
  repId:     `test-rep-${suffix}`,
  resId:     `test-res-${suffix}`,
  repEmail:  `test.rep.${suffix}@integration-test.local`,
  resEmail:  `test.res.${suffix}@integration-test.local`,
  circId:    '' as string,
  perfilId:  '' as string,
};

const ANIO = 2090; // far future — never conflicts with real payments

const handler = new ProcesarPagoMpHandler({ residenteRepo, pagoRepo, circuitoRepo });

// ── Seed ───────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await db.insert(user).values({
    id: FX.repId, name: 'Test Representante', email: FX.repEmail,
    role: 'representante', emailVerified: true,
  });

  const [circ] = await db.insert(circuitos).values({
    nombre:                 `Circuito Integ-${suffix}`,
    representanteId:        FX.repId,
    montoMensual:           '100.00',
    montoReconexion:        '300.00',
    mercadoPagoCollectorId: `col-${suffix}`,
    activo:                  true,
  }).returning({ id: circuitos.id });
  FX.circId = circ.id;

  await db.insert(user).values({
    id: FX.resId, name: 'Test Residente', email: FX.resEmail,
    role: 'residente', emailVerified: true,
  });

  const [perfil] = await db.insert(perfilesResidente).values({
    userId:       FX.resId,
    telefono:     '5500000000',
    sexo:         'otro',
    tenencia:     'propietario',
    circuitoId:   FX.circId,
    edificio:     'INTEG',
    departamento: '001a',
    estadoAgua:   'activo',
  }).returning({ id: perfilesResidente.id });
  FX.perfilId = perfil.id;
});

// ── Teardown ───────────────────────────────────────────────────────────────────
afterAll(async () => {
  if (!FX.perfilId) return;
  try {
    // 1. Tickets referencing test pagos
    const testPagos = await db
      .select({ id: pagos.id })
      .from(pagos)
      .where(eq(pagos.perfilId, FX.perfilId));
    if (testPagos.length) {
      await db.delete(tickets).where(
        inArray(tickets.pagoId, testPagos.map(p => p.id)),
      );
      await db.delete(pagos).where(eq(pagos.perfilId, FX.perfilId));
    }

    // 2. Residente user → cascades to perfilesResidente
    await db.delete(user).where(eq(user.id, FX.resId));

    // 3. Clear FK before deleting representante
    await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.id, FX.circId));
    await db.delete(user).where(eq(user.id, FX.repId));

    // 4. Circuito (now has no FK references)
    await db.delete(circuitos).where(eq(circuitos.id, FX.circId));
  } catch (e) {
    console.error('Integration test teardown failed:', e);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function cmd(mes: number, overrides: Partial<{
  esReconexion:           boolean;
  mercadoPagoPaymentId:   string;
  mercadoPagoCollectorId: string;
}> = {}) {
  return {
    perfilId:               FX.perfilId,
    mes,
    anio:                   ANIO,
    monto:                  '100.00',
    esReconexion:           overrides.esReconexion ?? false,
    metodo:                 `mercado_pago:${overrides.mercadoPagoPaymentId ?? 'mp-001'}`,
    mercadoPagoPaymentId:   overrides.mercadoPagoPaymentId ?? 'mp-001',
    mercadoPagoCollectorId: overrides.mercadoPagoCollectorId ?? `col-${suffix}`,
  };
}

async function getPago(mes: number) {
  return db.query.pagos.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.perfilId, FX.perfilId), eq(p.mes, mes), eq(p.anio, ANIO)),
  });
}

async function getPerfil() {
  return db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, FX.perfilId),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('Checkout flow — integración con BD real', () => {
  describe('ProcesarPagoMpHandler — happy path', () => {
    it('crea el pago con todos los campos correctos', async () => {
      const result = await handler.execute(cmd(1));

      expect(result.yaRegistrado).toBe(false);
      expect(result.folio).toMatch(/^AGU-/);

      const pago = await getPago(1);
      expect(pago).toBeDefined();
      expect(pago!.estado).toBe('pagado');
      expect(pago!.metodo).toBe('mercado_pago:mp-001');
      expect(pago!.mercadoPagoPaymentId).toBe('mp-001');
      expect(pago!.mercadoPagoCollectorId).toBe(`col-${suffix}`);
      expect(pago!.circuitoId).toBe(FX.circId);
      expect(pago!.mes).toBe(1);
      expect(pago!.anio).toBe(ANIO);
      expect(pago!.esReconexion).toBe(false);
      expect(parseFloat(pago!.monto)).toBeGreaterThan(0);
      expect(parseFloat(pago!.montoBase!)).toBeCloseTo(100, 0);
    });

    it('crea el ticket asociado al pago', async () => {
      const pago = await getPago(1);
      expect(pago).toBeDefined();

      const ticket = await db.query.tickets.findFirst({
        where: (t, { eq }) => eq(t.pagoId, pago!.id),
      });
      expect(ticket).toBeDefined();
      expect(ticket!.folio).toMatch(/^AGU-/);
    });

    it('perfil activo no cambia de estado al pagar', async () => {
      const perfil = await getPerfil();
      expect(perfil!.estadoAgua).toBe('activo');
    });
  });

  describe('Idempotencia', () => {
    it('segunda llamada idéntica devuelve el mismo folio sin crear duplicado', async () => {
      const first = await handler.execute(cmd(2));
      expect(first.yaRegistrado).toBe(false);

      const second = await handler.execute(cmd(2));
      expect(second.yaRegistrado).toBe(true);
      expect(second.folio).toBe(first.folio);
    });

    it('exactamente un pago por perfil/mes/año en BD', async () => {
      // previous sub-test already ensured uniqueness, verify here too
      const rows = await db
        .select({ id: pagos.id })
        .from(pagos)
        .where(and(eq(pagos.perfilId, FX.perfilId), eq(pagos.mes, 2), eq(pagos.anio, ANIO)));
      expect(rows).toHaveLength(1);
    });
  });

  describe('Transiciones de estado', () => {
    it('pendiente_corte → activo tras pago normal', async () => {
      await db.update(perfilesResidente)
        .set({ estadoAgua: 'pendiente_corte' })
        .where(eq(perfilesResidente.id, FX.perfilId));

      await handler.execute(cmd(3));

      const perfil = await getPerfil();
      expect(perfil!.estadoAgua).toBe('activo');
    });

    it('cortado → pendiente_reconexion tras pago con esReconexion=true', async () => {
      await db.update(perfilesResidente)
        .set({ estadoAgua: 'cortado' })
        .where(eq(perfilesResidente.id, FX.perfilId));

      const result = await handler.execute(cmd(4, { esReconexion: true }));
      expect(result.esReconexion).toBe(true);

      const perfil = await getPerfil();
      expect(perfil!.estadoAgua).toBe('pendiente_reconexion');

      // Amount base = montoMensual (100) + montoReconexion (300) = 400
      const pago = await getPago(4);
      expect(parseFloat(pago!.montoBase!)).toBeCloseTo(400, 0);

      // Reset for subsequent tests
      await db.update(perfilesResidente)
        .set({ estadoAgua: 'activo' })
        .where(eq(perfilesResidente.id, FX.perfilId));
    });

    it('activo no cambia estado si esReconexion=false (sin corte)', async () => {
      // Profile is 'activo' from reset above; normal payment should keep it 'activo'
      await handler.execute(cmd(6));
      const perfil = await getPerfil();
      expect(perfil!.estadoAgua).toBe('activo');
    });
  });

  describe('Concurrencia', () => {
    it('dos webhooks simultáneos para el mismo mes/año producen un solo pago', async () => {
      const results = await Promise.allSettled([
        handler.execute(cmd(5, { mercadoPagoPaymentId: 'mp-concurrent-a' })),
        handler.execute(cmd(5, { mercadoPagoPaymentId: 'mp-concurrent-b' })),
      ]);

      // At least one must succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes.length).toBeGreaterThanOrEqual(1);

      // Never more than one payment row regardless of concurrency outcome
      const rows = await db
        .select({ id: pagos.id })
        .from(pagos)
        .where(and(eq(pagos.perfilId, FX.perfilId), eq(pagos.mes, 5), eq(pagos.anio, ANIO)));
      expect(rows).toHaveLength(1);
    });
  });

  describe('External reference round-trip', () => {
    it('la referencia construida por checkout parsea de vuelta con los mismos campos', () => {
      const mes = 7;
      const anio = ANIO;
      const esReconexion = false;
      const montoBase = '100.00';

      // This mirrors exactly what app/api/mercadopago/checkout/route.ts constructs
      const externalRef = ['agua', FX.perfilId, mes, anio, esReconexion ? '1' : '0', montoBase].join('|');

      const parsed = parseExternalReference(externalRef);
      expect(parsed).not.toBeNull();
      expect(parsed!.perfilId).toBe(FX.perfilId);
      expect(parsed!.mes).toBe(mes);
      expect(parsed!.anio).toBe(anio);
      expect(parsed!.esReconexion).toBe(false);
      expect(parsed!.monto).toBe('100.00');
    });

    it('referencia de reconexión se parsea con esReconexion=true y monto correcto', () => {
      const externalRef = ['agua', FX.perfilId, 8, ANIO, '1', '400.00'].join('|');
      const parsed = parseExternalReference(externalRef);
      expect(parsed!.esReconexion).toBe(true);
      expect(parsed!.monto).toBe('400.00');
    });

    it('el external_reference completo sobrevive encode + decode de URL', () => {
      const externalRef = ['agua', FX.perfilId, 9, ANIO, '0', '100.00'].join('|');
      const encoded = encodeURIComponent(externalRef);
      const decoded = decodeURIComponent(encoded);
      expect(parseExternalReference(decoded)).not.toBeNull();
    });
  });

  describe('Validaciones de datos', () => {
    it('lanza si el perfil no existe', async () => {
      await expect(
        handler.execute({ ...cmd(10), perfilId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toThrow('Perfil no encontrado');
    });

    it('los campos financieros quedan con valores coherentes (montoBase ≤ monto total)', async () => {
      const pago = await getPago(1);
      expect(pago).toBeDefined();
      expect(parseFloat(pago!.montoBase!)).toBeLessThanOrEqual(parseFloat(pago!.monto));
    });
  });
});
