import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/db';
import { createMercadoPagoClients, extractMercadoPagoError } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { checkoutAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { opaqueRateLimitKey } from '@/lib/request-security';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { calcularDesglosePago, calcularMontoServicio } from '@/src/domain/pagos/calculator';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { cargosServicios, fraccionamientoMetodosPago, fraccionamientoServicios, fraccionamientos, pagos, servicios } from '@/db/schema';
import { persistMercadoPagoPaymentIntent, type MercadoPagoPaymentIntentPeriod } from '@/src/infrastructure/mercadopago/payment-intent';
import { logger } from '@/lib/logger';

const inputSchema = z.object({
  mesesAgua: z.number().int().min(0).max(12).default(0),
  cargoIds: z.array(z.string().uuid()).max(50).default([]),
  servicios: z.array(z.object({
    fraccionamientoServicioId: z.string().uuid(),
    meses: z.number().int().min(1).max(12),
  })).default([]),
}).refine(value => value.mesesAgua > 0 || value.cargoIds.length > 0 || value.servicios.length > 0);

const WINDOW_MS = 10 * 60 * 1000;

function addMonths(mes: number, anio: number, offset: number) {
  const total = mes - 1 + offset;
  return { mes: (total % 12) + 1, anio: anio + Math.floor(total / 12) };
}

function periodKey(periodo: { mes: number; anio: number }) {
  return `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
}

async function nextUnpaidPeriods(perfilId: string, fraccionamientoId: string, count: number) {
  if (count === 0) return [];
  const vigente = PeriodoVO.vigente();
  const paid = await db.select({ mes: pagos.mes, anio: pagos.anio }).from(pagos).where(and(eq(pagos.perfilId, perfilId), eq(pagos.fraccionamientoId, fraccionamientoId), eq(pagos.estado, 'pagado')));
  const paidKeys = new Set(paid.map(periodKey));
  const result: Array<{ mes: number; anio: number }> = [];
  for (let offset = 0; result.length < count; offset += 1) {
    const candidate = addMonths(vigente.mes, vigente.anio, offset);
    if (candidate.anio > 2100) break;
    if (!paidKeys.has(periodKey(candidate))) result.push(candidate);
  }
  return result;
}

async function nextUnpaidCargosForService({
  perfilId,
  fraccionamientoId,
  fraccionamientoServicioId,
  montoMensual,
  count,
}: {
  perfilId: string;
  fraccionamientoId: string;
  fraccionamientoServicioId: string;
  montoMensual: string | number;
  count: number;
}): Promise<string[]> {
  if (count <= 0) return [];

  const existing = await db.select({
    id: cargosServicios.id,
    mes: cargosServicios.mes,
    anio: cargosServicios.anio,
    estado: cargosServicios.estado,
  })
  .from(cargosServicios)
  .where(and(
    eq(cargosServicios.perfilId, perfilId),
    eq(cargosServicios.fraccionamientoId, fraccionamientoId),
    eq(cargosServicios.fraccionamientoServicioId, fraccionamientoServicioId),
  ))
  .orderBy(cargosServicios.anio, cargosServicios.mes);

  const paidKeys = new Set(existing.filter(c => c.estado === 'pagado').map(c => periodKey(c)));
  const pendingMap = new Map(existing.filter(c => c.estado === 'pendiente').map(c => [periodKey(c), c.id]));

  const vigente = PeriodoVO.vigente();
  const oldestPending = existing.find(c => c.estado === 'pendiente');
  let startPeriod = { mes: vigente.mes, anio: vigente.anio };
  if (oldestPending) {
    const diff = (oldestPending.anio - vigente.anio) * 12 + (oldestPending.mes - vigente.mes);
    if (diff < 0) {
      startPeriod = { mes: oldestPending.mes, anio: oldestPending.anio };
    }
  }

  const targetPeriods: Array<{ mes: number; anio: number }> = [];
  for (let offset = 0; targetPeriods.length < count; offset += 1) {
    const candidate = addMonths(startPeriod.mes, startPeriod.anio, offset);
    if (candidate.anio > 2100) break;
    if (!paidKeys.has(periodKey(candidate))) {
      targetPeriods.push(candidate);
    }
  }

  const resultIds: string[] = [];
  for (const period of targetPeriods) {
    const pKey = periodKey(period);
    const existingId = pendingMap.get(pKey);
    if (existingId) {
      resultIds.push(existingId);
    } else {
      const [created] = await db.insert(cargosServicios).values({
        fraccionamientoId,
        perfilId,
        fraccionamientoServicioId,
        mes: period.mes,
        anio: period.anio,
        monto: String(montoMensual),
        estado: 'pendiente',
        metodo: null,
        mercadoPagoPaymentId: null,
        folio: null,
        pagadoEn: null,
      }).onConflictDoNothing().returning({ id: cargosServicios.id });

      if (created?.id) {
        resultIds.push(created.id);
      } else {
        const [found] = await db.select({ id: cargosServicios.id })
          .from(cargosServicios)
          .where(and(
            eq(cargosServicios.perfilId, perfilId),
            eq(cargosServicios.fraccionamientoServicioId, fraccionamientoServicioId),
            eq(cargosServicios.mes, period.mes),
            eq(cargosServicios.anio, period.anio),
          ))
          .limit(1);
        if (found?.id) resultIds.push(found.id);
      }
    }
  }

  return resultIds;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: 'No autorizado', code: 'SISCO-403' }, { status: 401 });
  }

  const decision = checkoutAccountLimiter
    ? await consumeRateLimit({
        limiter: checkoutAccountLimiter,
        key: opaqueRateLimitKey('account', session.user.id),
        boundary: 'combined_checkout',
        scope: 'checkout_account',
        failOpen: false,
      })
    : null;
  if (decision && !decision.success) return rateLimitResponse(decision);

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Selecciona conceptos validos para pagar', code: 'SISCO-400' }, { status: 400 });
  }

  const perfil = await residenteRepo.findByUserIdWithPaymentConfig(session.user.id);
  if (!perfil?.fraccionamientoId) {
    return Response.json({ error: 'Perfil sin fraccionamiento asignado', code: 'SISCO-403' }, { status: 403 });
  }
  if (perfil.responsableCargos === false) {
    return Response.json({ error: 'Esta cuenta no tiene cargos de vivienda habilitados', code: 'SISCO-403' }, { status: 403 });
  }

  try {
    await subscriptionService.requireOperational(perfil.fraccionamientoId);
  } catch {
    return Response.json({ error: 'El fraccionamiento no tiene una suscripcion operativa vigente', code: 'SISCO-423' }, { status: 403 });
  }

  const [config] = await db
    .select({
      activo: fraccionamientos.activo,
      montoMensual: fraccionamientos.montoMensual,
      montoReconexion: fraccionamientos.montoReconexion,
      accessToken: fraccionamientoMetodosPago.accessTokenCifrado,
      collectorId: fraccionamientoMetodosPago.collectorId,
    })
    .from(fraccionamientos)
    .leftJoin(
      fraccionamientoMetodosPago,
      and(
        eq(fraccionamientoMetodosPago.fraccionamientoId, fraccionamientos.id),
        eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'),
        eq(fraccionamientoMetodosPago.activo, true),
      ),
    )
    .where(eq(fraccionamientos.id, perfil.fraccionamientoId))
    .limit(1);

  if (!config?.activo) {
    return Response.json({ error: 'El fraccionamiento esta desactivado', code: 'SISCO-423' }, { status: 403 });
  }

  const accessToken = decryptTokenSafe(config.accessToken);
  if (!accessToken) {
    return Response.json({ error: 'Mercado Pago no esta configurado para este fraccionamiento', code: 'SISCO-301' }, { status: 400 });
  }

  const allCargoIdsSet = new Set<string>(parsed.data.cargoIds);

  for (const item of parsed.data.servicios) {
    const [svc] = await db
      .select({
        id: fraccionamientoServicios.id,
        montoMensual: fraccionamientoServicios.montoMensual,
      })
      .from(fraccionamientoServicios)
      .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
      .where(
        and(
          eq(fraccionamientoServicios.id, item.fraccionamientoServicioId),
          eq(fraccionamientoServicios.fraccionamientoId, perfil.fraccionamientoId),
          eq(fraccionamientoServicios.estado, 'activo'),
          eq(servicios.activo, true),
          ne(servicios.clave, 'agua'),
        ),
      )
      .limit(1);

    if (!svc) {
      return Response.json({ error: 'Uno de los servicios seleccionados no esta disponible', code: 'SISCO-404' }, { status: 400 });
    }

    const serviceCargoIds = await nextUnpaidCargosForService({
      perfilId: perfil.id,
      fraccionamientoId: perfil.fraccionamientoId,
      fraccionamientoServicioId: svc.id,
      montoMensual: svc.montoMensual,
      count: item.meses,
    });

    if (serviceCargoIds.length !== item.meses) {
      return Response.json({ error: 'No se pudieron programar todos los periodos del servicio', code: 'SISCO-409' }, { status: 409 });
    }

    for (const id of serviceCargoIds) {
      allCargoIdsSet.add(id);
    }
  }

  const cargoIds = [...allCargoIdsSet].sort();

  const mandatoryChargeWhere = and(
    eq(cargosServicios.perfilId, perfil.id),
    eq(cargosServicios.fraccionamientoId, perfil.fraccionamientoId),
    eq(cargosServicios.estado, 'pendiente'),
    ne(servicios.clave, 'agua'),
  );
  const selectedCharges =
    cargoIds.length === 0
      ? []
      : await db
          .select({ id: cargosServicios.id, monto: cargosServicios.monto, nombre: servicios.nombre })
          .from(cargosServicios)
          .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
          .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
          .where(and(mandatoryChargeWhere, inArray(cargosServicios.id, cargoIds)));

  if (selectedCharges.length !== cargoIds.length) {
    return Response.json({ error: 'Uno o mas cargos ya no estan disponibles; actualiza la pagina', code: 'SISCO-202' }, { status: 409 });
  }

  const periods = await nextUnpaidPeriods(perfil.id, perfil.fraccionamientoId, parsed.data.mesesAgua);
  if (periods.length !== parsed.data.mesesAgua) {
    return Response.json({ error: 'No hay suficientes periodos de agua disponibles', code: 'SISCO-202' }, { status: 409 });
  }
  if (periods.length > 0 && perfil.estadoAgua === 'pendiente_reconexion') {
    return Response.json({ error: 'La reconexion esta pendiente de ser realizada', code: 'SISCO-203' }, { status: 409 });
  }

  const serviceConfig = periods.length > 0 && residenteRepo.findWaterServiceConfig ? await residenteRepo.findWaterServiceConfig(perfil.id) : null;
  const waterConfig = serviceConfig ?? { montoMensual: config.montoMensual, montoReconexion: config.montoReconexion, conCorteFisico: true };
  const isReconnection = periods.length > 0 && perfil.estadoAgua === 'cortado';
  const waterPeriods: MercadoPagoPaymentIntentPeriod[] = periods.map((period, index) => ({
    ...period,
    monto: calcularMontoServicio(waterConfig, { incluyeReconexion: index === 0 && isReconnection }).toFixed(2),
    esReconexion: index === 0 && isReconnection,
  }));
  const waterBase = waterPeriods.reduce((sum, period) => sum + Number(period.monto), 0);
  const serviceTotal = selectedCharges.reduce((sum, charge) => sum + Number(charge.monto), 0);
  const totalBase = waterBase + serviceTotal;
  if (totalBase <= 0) {
    return Response.json({ error: 'Selecciona al menos un concepto para pagar', code: 'SISCO-400' }, { status: 400 });
  }
  const total = Number(calcularDesglosePago(totalBase).total).toFixed(2);

  const now = new Date();
  const windowStart = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS;
  const canonical = JSON.stringify({ perfilId: perfil.id, fraccionamientoId: perfil.fraccionamientoId, waterPeriods, cargoIds, total, collectorId: config.collectorId ?? null, windowStart });
  const reference = `mix_${createHash('sha256').update(canonical).digest('hex').slice(0, 48)}`;
  const expiresAt = new Date(windowStart + WINDOW_MS * 2);

  await persistMercadoPagoPaymentIntent({
    externalReference: reference,
    tipo: 'mixto',
    perfilId: perfil.id,
    cargosServicioIds: cargoIds,
    periodos: waterPeriods,
    total,
    collectorId: config.collectorId,
    expiresAt,
  });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, '');
  const titleParts: string[] = [];
  if (waterPeriods.length > 0) {
    titleParts.push(`${waterPeriods.length} periodo${waterPeriods.length === 1 ? '' : 's'} de agua`);
  }
  if (selectedCharges.length > 0) {
    titleParts.push(`${selectedCharges.length} cargo${selectedCharges.length === 1 ? '' : 's'} de servicios`);
  }
  const title = titleParts.join(' y ') || 'Pago de servicios';

  const correlationId = `req_${createHash('sha256').update(`${reference}|${Date.now()}`).digest('hex').slice(0, 16)}`;

  let preference;
  try {
    const { preferenceClient } = createMercadoPagoClients(accessToken);
    preference = await preferenceClient.create({
      body: {
        external_reference: reference,
        items: [
          {
            id: reference,
            title: `Pago: ${title}`,
            quantity: 1,
            currency_id: 'MXN',
            unit_price: Number(total),
          },
        ],
        payer: {
          email: session.user.email,
          name: session.user.name || undefined,
        },
        notification_url: `${baseUrl}/api/mercadopago/webhook?ref=${encodeURIComponent(reference)}`,
        back_urls: {
          success: `${baseUrl}/api/mercadopago/return?ref=${encodeURIComponent(reference)}`,
          pending: `${baseUrl}/residente?payment=pending`,
          failure: `${baseUrl}/residente?payment=failure`,
        },
        auto_return: 'approved',
        binary_mode: true,
        expires: true,
        expiration_date_to: expiresAt.toISOString(),
      },
      requestOptions: {
        idempotencyKey: `mix-${createHash('sha256').update(`${reference}|${windowStart}`).digest('hex').slice(0, 40)}`,
      },
    });
  } catch (err: unknown) {
    const errorDetails = extractMercadoPagoError(err);
    logger.error('mp.checkout_combinado.preference_error', err instanceof Error ? err : undefined, {
      correlationId,
      perfilId: perfil.id,
      fraccionamientoId: perfil.fraccionamientoId,
      status: errorDetails.status,
      message: errorDetails.message,
    });

    return Response.json(
      {
        error: errorDetails.userMessage,
        code: errorDetails.code,
        correlationId,
      },
      { status: errorDetails.httpStatus },
    );
  }

  const url = preference.init_point ?? preference.sandbox_init_point;
  if (!url) {
    logger.error('mp.checkout_combinado.no_url', undefined, {
      correlationId,
      perfilId: perfil.id,
      fraccionamientoId: perfil.fraccionamientoId,
    });
    return Response.json(
      {
        error: 'Mercado Pago no devolvio una URL de pago',
        code: 'SISCO-301',
        correlationId,
      },
      { status: 502 },
    );
  }

  return Response.json({ url, total });
}
