import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { checkoutAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { opaqueRateLimitKey } from '@/lib/request-security';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { calcularDesglosePago, calcularMontoBase } from '@/src/domain/pagos/calculator';
import { PeriodoVO } from '@/src/domain/pagos/periodo.vo';
import { db } from '@/db';
import {
  persistMercadoPagoPaymentIntent,
  type MercadoPagoPaymentIntentPeriod,
} from '@/src/infrastructure/mercadopago/payment-intent';

const checkoutSchema = z.object({
  esReconexion:     z.boolean().optional(),
  mesesAdelantados: z.number().int().min(1).max(12).optional(),
});

// Una misma intencion conserva cuerpo e idempotency key durante diez minutos.
// La preferencia dura entre diez y veinte minutos segun el punto de la ventana
// en que se creo, suficiente para completar Checkout Pro sin dejar links viejos.
const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;
const PREFERENCE_LIFETIME_WINDOWS = 2;

function addMonths(mes: number, anio: number, offset: number) {
  const total = mes - 1 + offset;
  return {
    mes:  (total % 12) + 1,
    anio: anio + Math.floor(total / 12),
  };
}

function periodoKey(periodo: { mes: number; anio: number }) {
  return `${periodo.anio}${String(periodo.mes).padStart(2, '0')}`;
}

export function mercadoPagoIntentReference(input: {
  perfilId: string;
  circuitoId: string;
  periodos: MercadoPagoPaymentIntentPeriod[];
  total: string;
  collectorId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const windowStart = Math.floor(now.getTime() / IDEMPOTENCY_WINDOW_MS) * IDEMPOTENCY_WINDOW_MS;
  const canonical = JSON.stringify({
    version: 1,
    perfilId: input.perfilId,
    circuitoId: input.circuitoId,
    periodos: input.periodos,
    total: Number(input.total).toFixed(2),
    currency: 'MXN',
    collectorId: input.collectorId?.trim() || null,
    windowStart,
  });

  return `agua_${createHash('sha256').update(canonical).digest('hex').slice(0, 48)}`;
}

async function nextUnpaidPeriods(perfilId: string, count: number) {
  const periodo = PeriodoVO.vigente();
  const pagados = await db.query.pagos.findMany({
    where: (p, { eq, and }) => and(eq(p.perfilId, perfilId), eq(p.estado, 'pagado')),
    columns: { mes: true, anio: true },
  });
  const paidKeys = new Set(pagados.map(pago => periodoKey(pago)));
  const result: Array<{ mes: number; anio: number }> = [];

  // El limite es por operacion (12), no por la distancia del calendario. Si
  // existen adelantos ya pagados debemos saltarlos y seguir ofreciendo hasta
  // doce periodos nuevos, sin volver a cobrar ninguno.
  for (let offset = 0; result.length < count; offset += 1) {
    const candidate = addMonths(periodo.mes, periodo.anio, offset);
    if (candidate.anio > 2100) break;
    if (!paidKeys.has(periodoKey(candidate))) result.push(candidate);
  }

  return result;
}

export function mercadoPagoCheckoutMetadata(input: {
  perfilId: string;
  circuitoId: string;
  externalReference: string;
  total: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const windowStart = Math.floor(now.getTime() / IDEMPOTENCY_WINDOW_MS) * IDEMPOTENCY_WINDOW_MS;
  const canonical = [
    input.perfilId,
    input.circuitoId,
    input.externalReference,
    Number(input.total).toFixed(2),
    windowStart,
  ].join('|');

  return {
    idempotencyKey: `agua-${createHash('sha256').update(canonical).digest('hex').slice(0, 40)}`,
    expirationDateTo: new Date(
      windowStart + IDEMPOTENCY_WINDOW_MS * PREFERENCE_LIFETIME_WINDOWS,
    ).toISOString(),
  };
}

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BETTER_AUTH_URL,
  'https://sistema-agua.vercel.app',
  // localhost allowed in dev only
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
].filter(Boolean).map(o => (o as string).replace(/\/$/, ''));

export function OPTIONS() {
  // checkout is same-origin only; cross-origin preflight is not supported
  return new Response(null, { status: 405 });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 });

  if (checkoutAccountLimiter) {
    const accountDecision = await consumeRateLimit({
      limiter: checkoutAccountLimiter,
      key: opaqueRateLimitKey('account', session.user.id),
      boundary: 'checkout_route',
      scope: 'checkout_account',
    });
    if (accountDecision && !accountDecision.success) {
      return rateLimitResponse(accountDecision);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!appUrl) return Response.json({ error: 'Falta configurar NEXT_PUBLIC_APP_URL' }, { status: 500 });

  const body = checkoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: 'Solicitud invalida' }, { status: 400 });

  const perfil = await residenteRepo.findByUserIdWithPaymentConfig(session.user.id);
  if (!perfil) return Response.json({ error: 'Completa tu perfil primero' }, { status: 400 });
  if (!perfil.circuito?.activo) {
    return Response.json({ error: 'Tu circuito esta inhabilitado' }, { status: 403 });
  }
  if (!perfil.circuito?.representanteId) return Response.json({ error: 'Tu circuito no tiene representante asignado' }, { status: 400 });
  const accessToken = decryptTokenSafe(perfil.circuito.mercadoPagoAccessToken);
  if (!accessToken) {
    return Response.json({ error: 'El representante de tu circuito aun no tiene Mercado Pago configurado' }, { status: 400 });
  }

  const mesesAdelantados = body.data.mesesAdelantados ?? 1;
  const periodosSolicitados = await nextUnpaidPeriods(perfil.id, mesesAdelantados);
  if (periodosSolicitados.length !== mesesAdelantados) {
    return Response.json({ error: 'No hay suficientes periodos disponibles para pagar' }, { status: 400 });
  }

  const esReconexion = perfil.estadoAgua === 'cortado';
  const montoMensual = Number(calcularMontoBase(perfil.circuito.montoMensual, false, perfil.circuito.montoReconexion));
  const montoReconexion = esReconexion ? Number(perfil.circuito.montoReconexion) : 0;
  const montoBase = montoMensual * mesesAdelantados + montoReconexion;
  const desglose = calcularDesglosePago(montoBase);

  const intentPeriodos: MercadoPagoPaymentIntentPeriod[] = periodosSolicitados.map((periodo, index) => {
    const periodoEsReconexion = index === 0 && esReconexion;
    return {
      ...periodo,
      monto: calcularMontoBase(
        perfil.circuito!.montoMensual,
        periodoEsReconexion,
        perfil.circuito!.montoReconexion,
      ).toFixed(2),
      esReconexion: periodoEsReconexion,
    };
  });
  const checkoutNow = new Date();
  const externalReference = mercadoPagoIntentReference({
    perfilId: perfil.id,
    circuitoId: perfil.circuito.id,
    periodos: intentPeriodos,
    total: desglose.total,
    collectorId: perfil.circuito.mercadoPagoCollectorId,
    now: checkoutNow,
  });
  const baseUrl = appUrl.replace(/\/$/, '');
  const referenceParam = encodeURIComponent(externalReference);
  const { preferenceClient } = createMercadoPagoClients(accessToken);
  const mesesLabel = mesesAdelantados === 1 ? '1 mes' : `${mesesAdelantados} meses`;
  const primerPeriodo = periodosSolicitados[0];
  const checkoutMetadata = mercadoPagoCheckoutMetadata({
    perfilId: perfil.id,
    circuitoId: perfil.circuito.id,
    externalReference,
    total: desglose.total,
    now: checkoutNow,
  });

  await persistMercadoPagoPaymentIntent({
    externalReference,
    perfilId: perfil.id,
    circuitoId: perfil.circuito.id,
    periodos: intentPeriodos,
    total: desglose.total,
    collectorId: perfil.circuito.mercadoPagoCollectorId,
    expiresAt: new Date(checkoutMetadata.expirationDateTo),
  });

  const preference = await preferenceClient.create({
    body: {
      items: [{
        id:          externalReference,
        title:       esReconexion ? 'Pago de agua, reconexion y meses adelantados' : 'Pago de agua adelantado',
        description: `${mesesLabel} desde ${primerPeriodo.mes}/${primerPeriodo.anio}`,
        quantity:    1,
        currency_id: 'MXN',
        unit_price:  Number(desglose.total),
      }],
      payer:              { email: session.user.email, name: session.user.name },
      external_reference: externalReference,
      notification_url:   `${baseUrl}/api/mercadopago/webhook?ref=${referenceParam}`,
      back_urls: {
        success: `${baseUrl}/api/mercadopago/return?ref=${referenceParam}`,
        pending: `${baseUrl}/residente?payment=pending`,
        failure: `${baseUrl}/residente?payment=failure`,
      },
      auto_return:  'approved',
      binary_mode:  true,
      expires: true,
      expiration_date_to: checkoutMetadata.expirationDateTo,
    },
    requestOptions: { idempotencyKey: checkoutMetadata.idempotencyKey },
  });

  const url = preference.init_point ?? preference.sandbox_init_point;
  if (!url) return Response.json({ error: 'Mercado Pago no devolvio una URL de pago' }, { status: 502 });

  return Response.json({ url, desglose });
}
