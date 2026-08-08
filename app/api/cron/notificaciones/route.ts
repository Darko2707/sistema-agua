import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notificaciones } from '@/db/schema';
import { logger } from '@/lib/logger';
import { sendWhatsAppTemplateMessage } from '@/lib/whatsapp';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function templateFor(tipo: string) {
  const map: Record<string, string> = {
    pago_confirmado:       process.env.WHATSAPP_PAYMENT_TEMPLATE ?? 'sis4s_pago_confirmado',
    corte_pendiente:       process.env.WHATSAPP_CUT_TEMPLATE ?? 'sis4s_corte_pendiente',
    reconexion_confirmada: process.env.WHATSAPP_RECONNECTION_TEMPLATE ?? 'sis4s_reconexion_confirmada',
    recibo_generado:       process.env.WHATSAPP_RECEIPT_TEMPLATE ?? 'sis4s_recibo_generado',
    atraso:                process.env.WHATSAPP_LATE_TEMPLATE ?? 'sis4s_atraso',
  };
  return map[tipo] ?? process.env.WHATSAPP_GENERIC_TEMPLATE ?? 'sis4s_notificacion';
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
      ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
      userAgent: req.headers.get('user-agent') ?? 'unknown',
      hasToken: !!token,
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const inicio = Date.now();
  const limit = Number(process.env.NOTIFICACIONES_CRON_LIMIT ?? 25);
  logger.info('cron.notificaciones.inicio', { path: '/api/cron/notificaciones', limit });

  try {
    const pendientes = await db.query.notificaciones.findMany({
      where: and(eq(notificaciones.estado, 'pendiente'), eq(notificaciones.canal, 'whatsapp')),
      orderBy: [asc(notificaciones.creadoEn)],
      limit,
    });

    let enviadas = 0;
    let fallidas = 0;

    for (const item of pendientes) {
      try {
        await sendWhatsAppTemplateMessage(item.destino, templateFor(item.tipo), [item.mensaje]);
        await db.update(notificaciones)
          .set({ estado: 'enviada', enviadoEn: new Date(), error: null })
          .where(eq(notificaciones.id, item.id));
        enviadas++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        await db.update(notificaciones)
          .set({ estado: 'fallida', error: message.slice(0, 500) })
          .where(eq(notificaciones.id, item.id));
        fallidas++;
        Sentry.captureException(error, {
          tags: { component: 'cron', job: 'notificaciones', notification_type: item.tipo },
          extra: { notificacionId: item.id },
        });
      }
    }

    const resultado = {
      fecha: new Date().toISOString(),
      procesadas: pendientes.length,
      enviadas,
      fallidas,
      duracionMs: Date.now() - inicio,
    };
    logger.info('cron.notificaciones.completado', resultado);
    return Response.json(resultado);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: 'notificaciones' },
      extra: { duracionMs: Date.now() - inicio },
    });
    logger.error('cron.notificaciones.error', error, { duracionMs: Date.now() - inicio });
    return new Response('Internal Server Error', { status: 500 });
  }
}
