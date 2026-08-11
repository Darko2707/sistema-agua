import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { dispatchPendingPushNotifications } from '@/lib/push-dispatcher';
import { encolarProximosCorte } from '@/src/infrastructure/db/jobs/encolar-proximos-corte';

export const runtime = 'nodejs';
export const maxDuration = 300;

function timingSafeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    Sentry.captureMessage('CRON_SECRET no configurado - cron de avisos de corte deshabilitado', {
      tags: { component: 'cron', job: 'avisos-corte', error_type: 'misconfigured' },
      level: 'fatal',
    });
    return new Response('Service Unavailable', { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !timingSafeCompare(token, cronSecret)) {
    logger.warn('cron.avisos-corte.unauthorized', {
      path: '/api/cron/avisos-corte',
      hasToken: Boolean(token),
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const inicio = Date.now();
  try {
    const resultado = await encolarProximosCorte();
    logger.info('cron.avisos-corte.completado', {
      ...resultado,
      duracionMs: Date.now() - inicio,
    });
    const entrega = resultado.encoladas > 0
      ? await dispatchPendingPushNotifications({
          notificationLimit: 1_000,
          deliveryLimit: 10_000,
          concurrency: 20,
          timeBudgetMs: 240_000,
        })
      : null;
    return Response.json({ fecha: new Date().toISOString(), ...resultado, entrega });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: 'avisos-corte' },
    });
    logger.error('cron.avisos-corte.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
