import { headers } from 'next/headers';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { checkoutAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { residenteRepo } from '@/src/infrastructure/db/repositories';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { cargosServicios, fraccionamientoMetodosPago, fraccionamientoServicios, servicios } from '@/db/schema';
import { db } from '@/db';
import { persistMercadoPagoPaymentIntent } from '@/src/infrastructure/mercadopago/payment-intent';

const inputSchema = z.object({ cargoId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const limit = await consumeRateLimit({ limiter: checkoutAccountLimiter, key: `account:${session.user.id}`, boundary: 'service_checkout', scope: 'checkout_account' });
  if (limit && !limit.success) return rateLimitResponse(limit);
  const body = inputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Cargo invalido' }, { status: 400 });

  const perfil = await residenteRepo.findByUserIdWithPaymentConfig(session.user.id);
  if (!perfil?.fraccionamientoId) return Response.json({ error: 'Perfil sin fraccionamiento' }, { status: 403 });
  try {
    await subscriptionService.requireOperational(perfil.fraccionamientoId);
  } catch {
    return Response.json({ error: 'El fraccionamiento no tiene una suscripcion operativa vigente' }, { status: 403 });
  }
  const [cargo] = await db.select({
    id: cargosServicios.id,
    monto: cargosServicios.monto,
    mes: cargosServicios.mes,
    anio: cargosServicios.anio,
    estado: cargosServicios.estado,
    service: servicios.clave,
  }).from(cargosServicios)
    .innerJoin(fraccionamientoServicios, eq(fraccionamientoServicios.id, cargosServicios.fraccionamientoServicioId))
    .innerJoin(servicios, eq(servicios.id, fraccionamientoServicios.servicioId))
    .where(and(eq(cargosServicios.id, body.data.cargoId), eq(cargosServicios.perfilId, perfil.id), eq(cargosServicios.fraccionamientoId, perfil.fraccionamientoId)))
    .limit(1);
  if (!cargo) return Response.json({ error: 'Cargo no encontrado' }, { status: 404 });
  if (cargo.estado !== 'pendiente') return Response.json({ error: 'El cargo ya fue resuelto' }, { status: 409 });

  const [method] = await db.select({ accessToken: fraccionamientoMetodosPago.accessTokenCifrado, collectorId: fraccionamientoMetodosPago.collectorId })
    .from(fraccionamientoMetodosPago)
    .where(and(eq(fraccionamientoMetodosPago.fraccionamientoId, perfil.fraccionamientoId), eq(fraccionamientoMetodosPago.proveedor, 'mercado_pago'), eq(fraccionamientoMetodosPago.activo, true)))
    .limit(1);
  const accessToken = decryptTokenSafe(method?.accessToken ?? perfil.circuito?.mercadoPagoAccessToken);
  if (!accessToken) return Response.json({ error: 'Mercado Pago no configurado' }, { status: 503 });
  const collectorId = method?.collectorId ?? perfil.circuito?.mercadoPagoCollectorId ?? null;
  const reference = `serv_${cargo.id}`;
  const checkoutWindowMs = 20 * 60 * 1000;
  const checkoutWindowStart = Math.floor(Date.now() / checkoutWindowMs) * checkoutWindowMs;
  const expiresAt = new Date(checkoutWindowStart + checkoutWindowMs * 2);
  await persistMercadoPagoPaymentIntent({
    externalReference: reference,
    tipo: 'servicio',
    perfilId: perfil.id,
    circuitoId: perfil.circuitoId,
    cargoServicioId: cargo.id,
    periodos: [{ mes: cargo.mes, anio: cargo.anio, monto: Number(cargo.monto).toFixed(2), esReconexion: false }],
    total: Number(cargo.monto).toFixed(2),
    collectorId,
    expiresAt,
  });
  const { preferenceClient } = createMercadoPagoClients(accessToken);
  const preference = await preferenceClient.create({
    body: {
      external_reference: reference,
      items: [{ id: reference, title: `Servicio ${cargo.service}`, quantity: 1, currency_id: 'MXN', unit_price: Number(cargo.monto) }],
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/api/mercadopago/webhook?ref=${encodeURIComponent(reference)}`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/api/mercadopago/return?ref=${encodeURIComponent(reference)}`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/residente?payment=pending`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/residente?payment=failure`,
      },
      auto_return: 'approved',
      binary_mode: true,
      expires: true,
      expiration_date_to: expiresAt.toISOString(),
      ...(collectorId ? { collector_id: Number(collectorId) } : {}),
    },
    requestOptions: { idempotencyKey: `serv-${cargo.id}-${checkoutWindowStart}` },
  });
  return Response.json({ url: preference.init_point, referencia: reference });
}
