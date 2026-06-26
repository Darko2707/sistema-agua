/**
 * Integration tests — marcarMorososDelMes con BD real
 *
 * Run with:
 *   npx vitest run --config vitest.integration.config.ts
 *
 * SAFETY: marcarMorososDelMes is a global UPDATE. We use a safeMarcar() wrapper
 * that snapshots non-fixture activo residents before each call and restores them
 * afterward, so real dev-DB residents are never permanently affected.
 *
 * Escenarios cubiertos:
 *   - Solo residentes activos son marcados (cortado / pendiente_* quedan intactos)
 *   - El pago debe ser del mes/año exacto — pagos de otros meses o años no protegen
 *   - Pagos con estado != 'pagado' no cuentan como protección
 *   - Idempotencia: segunda ejecución no re-marca a quienes ya son pendiente_corte
 *   - Múltiples períodos consecutivos: cada mes se evalúa de forma independiente
 *   - El pago atrasado de mes anterior no protege en el mes siguiente
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import { eq, and, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/db';
import { user, circuitos, perfilesResidente, pagos } from '@/db/schema';
import { residenteRepo, pagoRepo } from '@/src/infrastructure/db/repositories';

// ── Fixture IDs ────────────────────────────────────────────────────────────────
const suffix = nanoid(8);

const FX = {
  repId:    `test-rep-${suffix}`,
  repEmail: `rep.${suffix}@integration-test.local`,
  circId:   '' as string,

  // Each resident covers a distinct edge case:
  resA_id: `test-resA-${suffix}`,  // activo, sin pago              → debe marcarse
  resB_id: `test-resB-${suffix}`,  // activo, pago MES/ANIO pagado  → protegido
  resC_id: `test-resC-${suffix}`,  // activo, pago MES-1/ANIO       → no protege (período erróneo)
  resD_id: `test-resD-${suffix}`,  // pendiente_corte               → no cambia (no es activo)
  resE_id: `test-resE-${suffix}`,  // cortado                       → no cambia
  resF_id: `test-resF-${suffix}`,  // pendiente_reconexion           → no cambia
  resG_id: `test-resG-${suffix}`,  // activo, pago MES/ANIO-1       → no protege (año erróneo)
  resH_id: `test-resH-${suffix}`,  // activo, pago pendiente MES/ANIO → no protege (estado != pagado)
  resI_id: `test-resI-${suffix}`,  // activo, sin pago — para tests de múltiples períodos

  perfA: '' as string, perfB: '' as string, perfC: '' as string,
  perfD: '' as string, perfE: '' as string, perfF: '' as string,
  perfG: '' as string, perfH: '' as string, perfI: '' as string,
};

const MES   = 6;
const ANIO  = 2090; // año ficticio — no colisiona con pagos reales

// perfil IDs del fixture — para excluirlos en colateral-restore
let FIXTURE_PERF_IDS: string[] = [];

// ── Seed ───────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await db.insert(user).values({
    id: FX.repId, name: 'Rep Morosos', email: FX.repEmail,
    role: 'representante', emailVerified: true,
  });
  const [circ] = await db.insert(circuitos).values({
    nombre: `Circ-Morosos-${suffix}`, representanteId: FX.repId,
    montoMensual: '100.00', montoReconexion: '300.00', activo: true,
  }).returning({ id: circuitos.id });
  FX.circId = circ.id;

  async function seedRes(
    id: string,
    email: string,
    estado: 'activo' | 'pendiente_corte' | 'cortado' | 'pendiente_reconexion',
    depto: string,
  ) {
    await db.insert(user).values({
      id, name: `Res ${depto}`, email, role: 'residente', emailVerified: true,
    });
    const [p] = await db.insert(perfilesResidente).values({
      userId: id, telefono: '5500000000', sexo: 'otro', tenencia: 'propietario',
      circuitoId: FX.circId, edificio: 'INT', departamento: depto, estadoAgua: estado,
    }).returning({ id: perfilesResidente.id });
    return p.id;
  }

  FX.perfA = await seedRes(FX.resA_id, `resA.${suffix}@t.local`, 'activo',            '001');
  FX.perfB = await seedRes(FX.resB_id, `resB.${suffix}@t.local`, 'activo',            '002');
  FX.perfC = await seedRes(FX.resC_id, `resC.${suffix}@t.local`, 'activo',            '003');
  FX.perfD = await seedRes(FX.resD_id, `resD.${suffix}@t.local`, 'pendiente_corte',   '004');
  FX.perfE = await seedRes(FX.resE_id, `resE.${suffix}@t.local`, 'cortado',           '005');
  FX.perfF = await seedRes(FX.resF_id, `resF.${suffix}@t.local`, 'pendiente_reconexion', '006');
  FX.perfG = await seedRes(FX.resG_id, `resG.${suffix}@t.local`, 'activo',            '007');
  FX.perfH = await seedRes(FX.resH_id, `resH.${suffix}@t.local`, 'activo',            '008');
  FX.perfI = await seedRes(FX.resI_id, `resI.${suffix}@t.local`, 'activo',            '009');

  FIXTURE_PERF_IDS = [
    FX.perfA, FX.perfB, FX.perfC, FX.perfD, FX.perfE,
    FX.perfF, FX.perfG, FX.perfH, FX.perfI,
  ];

  async function seedPago(
    perfilId: string,
    mes: number,
    anio: number,
    estado: 'pagado' | 'pendiente',
  ) {
    await db.insert(pagos).values({
      perfilId, circuitoId: FX.circId, representanteId: FX.repId,
      mes, anio,
      monto: '100.00', montoBase: '100.00', iva: '0.00',
      comisionMercadoPago: '0.00', retencionIsr: '0.00', retencionIva: '0.00',
      montoNetoRepresentante: '100.00',
      estado, metodo: 'efectivo',
      folio: `AGU-TST-${nanoid(6)}`, esReconexion: false, fechaPago: new Date(),
    });
  }

  await seedPago(FX.perfB, MES,     ANIO,     'pagado');   // protegido
  await seedPago(FX.perfC, MES - 1, ANIO,     'pagado');   // mes anterior — no protege
  await seedPago(FX.perfG, MES,     ANIO - 1, 'pagado');   // año anterior — no protege
  await seedPago(FX.perfH, MES,     ANIO,     'pendiente');// estado pendiente — no protege
});

// ── Teardown ───────────────────────────────────────────────────────────────────
afterAll(async () => {
  const perfIds = FIXTURE_PERF_IDS.filter(Boolean);
  const resIds  = [
    FX.resA_id, FX.resB_id, FX.resC_id, FX.resD_id, FX.resE_id,
    FX.resF_id, FX.resG_id, FX.resH_id, FX.resI_id,
  ];
  try {
    if (perfIds.length) await db.delete(pagos).where(inArray(pagos.perfilId, perfIds));
    await db.delete(user).where(inArray(user.id, resIds));
    await db.update(circuitos).set({ representanteId: null }).where(eq(circuitos.id, FX.circId));
    await db.delete(user).where(eq(user.id, FX.repId));
    await db.delete(circuitos).where(eq(circuitos.id, FX.circId));
  } catch (e) {
    console.error('Teardown failed:', e);
  }
});

// ── Safety wrapper ─────────────────────────────────────────────────────────────
// marcarMorososDelMes is a global UPDATE. Non-fixture activo residents in the dev
// DB would be incorrectly marked because they have no payments for year 2090.
// This wrapper snapshots them before the call and restores them after.
async function safeMarcar(mes: number, anio: number): Promise<number> {
  const colateral = await db
    .select({ id: perfilesResidente.id, estado: perfilesResidente.estadoAgua })
    .from(perfilesResidente)
    .where(and(
      eq(perfilesResidente.estadoAgua, 'activo'),
      notInArray(perfilesResidente.id, FIXTURE_PERF_IDS),
    ));

  const count = await residenteRepo.marcarMorososDelMes(mes, anio);

  if (colateral.length) {
    await db.update(perfilesResidente)
      .set({ estadoAgua: 'activo' })
      .where(inArray(perfilesResidente.id, colateral.map(r => r.id)));
  }

  return count;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function estadoOf(perfilId: string) {
  const row = await db.query.perfilesResidente.findFirst({
    where: (p, { eq }) => eq(p.id, perfilId),
  });
  return row?.estadoAgua;
}

async function resetEstado(
  perfilId: string,
  estado: 'activo' | 'pendiente_corte' | 'cortado' | 'pendiente_reconexion',
) {
  await db.update(perfilesResidente)
    .set({ estadoAgua: estado })
    .where(eq(perfilesResidente.id, perfilId));
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('marcarMorososDelMes — integración con BD real', () => {
  describe('quién se marca y quién no', () => {
    // Run the cron once; all sub-tests just inspect the resulting state.
    beforeAll(async () => {
      await safeMarcar(MES, ANIO);
    });

    it('residente activo sin pago → pendiente_corte', async () => {
      expect(await estadoOf(FX.perfA)).toBe('pendiente_corte');
    });

    it('residente activo con pago pagado del mes exacto → permanece activo', async () => {
      expect(await estadoOf(FX.perfB)).toBe('activo');
    });

    it('pago del MES-1 no protege (período erróneo) → pendiente_corte', async () => {
      expect(await estadoOf(FX.perfC)).toBe('pendiente_corte');
    });

    it('residente ya en pendiente_corte → no cambia (no era activo)', async () => {
      expect(await estadoOf(FX.perfD)).toBe('pendiente_corte');
    });

    it('residente cortado → intacto', async () => {
      expect(await estadoOf(FX.perfE)).toBe('cortado');
    });

    it('residente pendiente_reconexion → intacto', async () => {
      expect(await estadoOf(FX.perfF)).toBe('pendiente_reconexion');
    });

    it('pago del AÑO-1 no protege (año erróneo) → pendiente_corte', async () => {
      expect(await estadoOf(FX.perfG)).toBe('pendiente_corte');
    });

    it('pago en estado "pendiente" no protege → pendiente_corte', async () => {
      expect(await estadoOf(FX.perfH)).toBe('pendiente_corte');
    });
  });

  describe('idempotencia', () => {
    it('segunda ejecución para el mismo mes/año retorna 0', async () => {
      // Todos los activos sin protección ya fueron marcados en el describe anterior.
      // Solo perfB sigue activo (protegido). Llamada extra no modifica nada.
      const count = await safeMarcar(MES, ANIO);
      expect(count).toBe(0);
    });

    it('el residente protegido sigue activo tras múltiples ejecuciones', async () => {
      await safeMarcar(MES, ANIO);
      expect(await estadoOf(FX.perfB)).toBe('activo');
    });
  });

  describe('múltiples períodos — pagos atrasados', () => {
    it('pago del mes 5 no protege en la evaluación del mes 6 (mes anterior no cuenta)', async () => {
      // perfC: tiene pago mes 5/2090 'pagado', pero fue marcado para mes 6/2090.
      // Confirmar el pago existe y el estado es correcto.
      const pagoMes5 = await db.query.pagos.findFirst({
        where: (p, { eq, and }) =>
          and(eq(p.perfilId, FX.perfC), eq(p.mes, MES - 1), eq(p.anio, ANIO)),
      });
      expect(pagoMes5?.estado).toBe('pagado');
      expect(await estadoOf(FX.perfC)).toBe('pendiente_corte');
    });

    it('pagar el mes 6 no protege en la evaluación del mes 7', async () => {
      // perfB pagó mes 6; para mes 7 no tiene pago → se marca.
      await resetEstado(FX.perfB, 'activo');

      await safeMarcar(MES + 1, ANIO);

      expect(await estadoOf(FX.perfB)).toBe('pendiente_corte');
      await resetEstado(FX.perfB, 'activo'); // restaurar para tests siguientes
    });

    it('un pago tardío del mes 7 no protege en la evaluación del mes 8', async () => {
      // Insertar pago tardío de mes 7 para perfI (paga después de la fecha de corte)
      await db.insert(pagos).values({
        perfilId: FX.perfI, circuitoId: FX.circId, representanteId: FX.repId,
        mes: MES + 1, anio: ANIO,
        monto: '100.00', montoBase: '100.00', iva: '0.00',
        comisionMercadoPago: '0.00', retencionIsr: '0.00', retencionIva: '0.00',
        montoNetoRepresentante: '100.00',
        estado: 'pagado', metodo: 'efectivo',
        folio: `AGU-LATE-${nanoid(6)}`, esReconexion: false, fechaPago: new Date(),
      });
      await resetEstado(FX.perfI, 'activo');

      // Evaluar mes 8 — pago de mes 7 no protege
      await safeMarcar(MES + 2, ANIO);

      expect(await estadoOf(FX.perfI)).toBe('pendiente_corte');

      // Limpiar pago de mes 7 (teardown cubre el resto)
      await db.delete(pagos).where(
        and(eq(pagos.perfilId, FX.perfI), eq(pagos.mes, MES + 1), eq(pagos.anio, ANIO)),
      );
    });

    it('año diferente es completamente independiente: pago 2089 no protege en 2090', async () => {
      // perfG: pago mes 6/2089 no protege en mes 6/2090
      const pagoAnioViejo = await db.query.pagos.findFirst({
        where: (p, { eq, and }) =>
          and(eq(p.perfilId, FX.perfG), eq(p.mes, MES), eq(p.anio, ANIO - 1)),
      });
      expect(pagoAnioViejo?.estado).toBe('pagado');
      expect(await estadoOf(FX.perfG)).toBe('pendiente_corte');
    });

    it('pagar el mes completo rehabilita: mes 6 pagado tras marcar → activo en mes 7 si paga', async () => {
      // Simula: residente paga mes 6 después del corte y paga mes 7 antes del corte.
      // Estado: debe quedar activo en evaluación de mes 7.
      await db.insert(pagos).values({
        perfilId: FX.perfA, circuitoId: FX.circId, representanteId: FX.repId,
        mes: MES + 1, anio: ANIO,
        monto: '100.00', montoBase: '100.00', iva: '0.00',
        comisionMercadoPago: '0.00', retencionIsr: '0.00', retencionIva: '0.00',
        montoNetoRepresentante: '100.00',
        estado: 'pagado', metodo: 'efectivo',
        folio: `AGU-REH-${nanoid(6)}`, esReconexion: false, fechaPago: new Date(),
      });
      await resetEstado(FX.perfA, 'activo');

      // Evaluación de mes 7 — perfA tiene pago pagado de mes 7
      await safeMarcar(MES + 1, ANIO);

      expect(await estadoOf(FX.perfA)).toBe('activo');

      // Limpiar pago extra
      await db.delete(pagos).where(
        and(eq(pagos.perfilId, FX.perfA), eq(pagos.mes, MES + 1), eq(pagos.anio, ANIO)),
      );
    });
  });

  describe('valor de retorno', () => {
    it('devuelve exactamente el número de fixtures activos marcados', async () => {
      // Reset A, C, G, H, I a activo (B ya es activo; D, E, F no son activos)
      for (const id of [FX.perfA, FX.perfC, FX.perfG, FX.perfH, FX.perfI]) {
        await resetEstado(id, 'activo');
      }

      const count = await safeMarcar(MES, ANIO);

      // A (sin pago), C (mes-1), G (año-1), H (pendiente), I (sin pago) = 5
      // B está protegido → no cuenta
      expect(count).toBe(5);
    });
  });

  describe('via VerificarMorososHandler completo', () => {
    it('handler retorna campos correctos integrando con la BD real', async () => {
      // Preparar: I sin pago para mes 6 → debe ser marcado
      await resetEstado(FX.perfI, 'activo');

      const { VerificarMorososHandler } = await import(
        '@/src/application/cron/verificar-morosos.handler'
      );
      const handler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

      vi.useFakeTimers();
      vi.setSystemTime(new Date(ANIO, MES - 1, 15, 12, 0, 0));

      try {
        const resultado = await safeMarcarViaHandler(handler, MES, ANIO);
        expect(resultado.mes).toBe(MES);
        expect(resultado.anio).toBe(ANIO);
        expect(resultado.dia).toBe(15);
        expect(resultado.totalMorosos).toBeGreaterThanOrEqual(1); // al menos perfI
        expect(resultado.totalPagados).toBeGreaterThanOrEqual(1); // al menos perfB
        expect(resultado.procesados).toBe(resultado.totalMorosos);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

// Handler wrapper — same safety logic but via the handler's own execute()
async function safeMarcarViaHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: { execute(): Promise<any> },
  _mes: number,
  _anio: number,
) {
  const colateral = await db
    .select({ id: perfilesResidente.id })
    .from(perfilesResidente)
    .where(and(
      eq(perfilesResidente.estadoAgua, 'activo'),
      notInArray(perfilesResidente.id, FIXTURE_PERF_IDS),
    ));

  const resultado = await handler.execute();

  if (colateral.length) {
    await db.update(perfilesResidente)
      .set({ estadoAgua: 'activo' })
      .where(inArray(perfilesResidente.id, colateral.map(r => r.id)));
  }

  return resultado;
}
