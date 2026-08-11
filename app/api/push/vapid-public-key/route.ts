import { PushConfigurationError, getVapidPublicKey } from '@/lib/push';

export const runtime = 'nodejs';

export function GET() {
  try {
    return Response.json(
      { publicKey: getVapidPublicKey() },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    if (!(error instanceof PushConfigurationError)) throw error;
    return Response.json({ error: 'Notificaciones push no configuradas' }, { status: 503 });
  }
}
