import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { dispatchPendingPushNotifications } from '@/lib/push-dispatcher';

export const runtime = 'nodejs';
export const maxDuration = 300;

function timingSafeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    Sentry.captureMessage('CRON_SECRET no configurado - cron notificaciones deshabilitado', {
      tags: { component: 'cron', job: 'notificaciones', error_type: 'misconfigured' },
      level: 'fatal',
    });
    logger.error('cron.notificaciones.misconfigured', undefined, { path: '/api/cron/notificaciones' });
    return new Response('Service Unavailable', { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !timingSafeCompare(token, cronSecret)) {
    logger.warn('cron.notificaciones.unauthorized', {
      path: '/api/cron/notificaciones',
      hasToken: !!token,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const inicio = Date.now();
  const notificationLimit = positiveInteger(process.env.PUSH_NOTIFICATION_BATCH_SIZE, 1_000, 2_000);
  const deliveryLimit = positiveInteger(process.env.PUSH_DELIVERY_BATCH_SIZE, 2_000, 10_000);
  const concurrency = positiveInteger(process.env.PUSH_CONCURRENCY, 20, 25);
  logger.info('cron.notificaciones.inicio', {
    path: '/api/cron/notificaciones',
    notificationLimit,
    deliveryLimit,
    concurrency,
  });

  try {
    const resultado = await dispatchPendingPushNotifications({
      notificationLimit,
      deliveryLimit,
      concurrency,
    });
    const response = {
      fecha: new Date().toISOString(),
      ...resultado,
      duracionMs: Date.now() - inicio,
    };
    logger.info('cron.notificaciones.completado', response);
    return Response.json(response);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: 'notificaciones' },
      extra: { duracionMs: Date.now() - inicio },
    });
    logger.error('cron.notificaciones.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
