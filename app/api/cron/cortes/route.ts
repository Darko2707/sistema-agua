import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { residenteRepo, pagoRepo } from '@/src/infrastructure/db/repositories';
import { VerificarMorososHandler } from '@/src/application/cron/verificar-morosos.handler';
import { logger } from '@/lib/logger';

const verificarMorososHandler = new VerificarMorososHandler({ residenteRepo, pagoRepo });

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
      tags: { component: 'cron', job: 'cortes', error_type: 'misconfigured' },
      level: 'fatal',
    });
    logger.error('cron.cortes.misconfigured', undefined, { path: '/api/cron/cortes', message: 'CRON_SECRET no está configurado' });
    return new Response('Service Unavailable', { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !timingSafeCompare(token, cronSecret)) {
    logger.warn('cron.cortes.unauthorized', {
      path:      '/api/cron/cortes',
      ip:        req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
      userAgent: req.headers.get('user-agent') ?? 'unknown',
      hasToken:  !!token,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const inicio = Date.now();
  logger.info('cron.cortes.inicio', { path: '/api/cron/cortes' });

  try {
    const resultado = await verificarMorososHandler.execute();
    logger.info('cron.cortes.completado', { ...resultado, duracionMs: Date.now() - inicio });
    return Response.json({ fecha: new Date().toISOString(), ...resultado });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: 'cortes' },
      extra: { duracionMs: Date.now() - inicio },
    });
    logger.error('cron.cortes.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
