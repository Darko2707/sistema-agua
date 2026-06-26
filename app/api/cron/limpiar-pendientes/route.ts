import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { pagoRepo } from '@/src/infrastructure/db/repositories';
import { LimpiarPendientesHandler } from '@/src/application/pagos/commands/limpiar-pendientes.handler';
import { logger } from '@/lib/logger';

const handler = new LimpiarPendientesHandler({ pagoRepo });

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
    Sentry.captureMessage('CRON_SECRET no configurado — cron deshabilitado', {
      tags: { component: 'cron', job: 'limpiar-pendientes', error_type: 'misconfigured' },
      level: 'fatal',
    });
    logger.error('cron.limpiar-pendientes.misconfigured', undefined, { path: '/api/cron/limpiar-pendientes' });
    return new Response('Service Unavailable', { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !timingSafeCompare(token, cronSecret)) {
    logger.warn('cron.limpiar-pendientes.unauthorized', {
      path:      '/api/cron/limpiar-pendientes',
      ip:        req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
      hasToken:  !!token,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const inicio = Date.now();
  logger.info('cron.limpiar-pendientes.inicio', { path: '/api/cron/limpiar-pendientes' });

  try {
    const resultado = await handler.execute();
    logger.info('cron.limpiar-pendientes.completado', { ...resultado, duracionMs: Date.now() - inicio });
    return Response.json({ fecha: new Date().toISOString(), ...resultado });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: 'limpiar-pendientes' },
      extra: { duracionMs: Date.now() - inicio },
    });
    logger.error('cron.limpiar-pendientes.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
