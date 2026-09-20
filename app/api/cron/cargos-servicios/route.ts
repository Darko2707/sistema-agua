import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';

import { logger } from '@/lib/logger';
import { subscriptionService } from '@/src/infrastructure/db/services/subscription.service';
import { generateMonthlyServiceCharges } from '@/src/infrastructure/db/services/service-charge.service';

export const runtime = 'nodejs';
export const maxDuration = 300;

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function periodFromRequest(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const mesRaw = url.searchParams.get('mes');
  const anioRaw = url.searchParams.get('anio');
  const mes = mesRaw === null ? now.getUTCMonth() + 1 : Number(mesRaw);
  const anio = anioRaw === null ? now.getUTCFullYear() : Number(anioRaw);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    throw new Error('Periodo invalido');
  }
  return { mes, anio };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    Sentry.captureMessage('CRON_SECRET no configurado — cargos de servicios deshabilitados', {
      tags: { component: 'cron', job: 'cargos-servicios', error_type: 'misconfigured' },
      level: 'fatal',
    });
    return new Response('Service Unavailable', { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !timingSafeCompare(token, cronSecret)) {
    logger.warn('cron.cargos_servicios.unauthorized', { path: '/api/cron/cargos-servicios', hasToken: !!token });
    return new Response('Unauthorized', { status: 401 });
  }

  let periodo: { mes: number; anio: number };
  try {
    periodo = periodFromRequest(request);
  } catch {
    return Response.json({ error: 'Periodo invalido' }, { status: 400 });
  }

  const inicio = Date.now();
  try {
    const subscriptions = await subscriptionService.listAll();
    const tenants = [...new Set(
      subscriptions
        .filter(row => row.estadoEfectivo === 'activa' || row.estadoEfectivo === 'gracia')
        .map(row => row.fraccionamientoId),
    )];
    const resultados: Array<{ fraccionamientoId: string; generados: number; candidatos: number }> = [];
    const errores: Array<{ fraccionamientoId: string; error: string }> = [];

    for (const fraccionamientoId of tenants) {
      try {
        const resultado = await generateMonthlyServiceCharges({ ...periodo, fraccionamientoId });
        resultados.push({ fraccionamientoId, ...resultado });
      } catch (error) {
        errores.push({
          fraccionamientoId,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    const response = {
      fecha: new Date().toISOString(),
      periodo,
      fraccionamientosProcesados: resultados.length,
      generados: resultados.reduce((total, row) => total + row.generados, 0),
      errores,
      duracionMs: Date.now() - inicio,
    };
    logger.info('cron.cargos_servicios.completado', response);
    return Response.json(response, { status: errores.length > 0 ? 207 : 200 });
  } catch (error) {
    Sentry.captureException(error, { tags: { component: 'cron', job: 'cargos-servicios' } });
    logger.error('cron.cargos_servicios.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
