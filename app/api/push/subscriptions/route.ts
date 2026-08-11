import { z } from 'zod';

import { auth } from '@/lib/auth';
import {
  deletePushSubscription,
  isAllowedPushEndpoint,
  savePushSubscription,
} from '@/lib/push-subscriptions';

export const runtime = 'nodejs';

const endpointSchema = z.string().trim().url().max(2_048)
  .refine(isAllowedPushEndpoint, 'Proveedor push no permitido');
const keySchema = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/);

const saveSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().int().positive().max(8_640_000_000_000_000).nullable()
    .refine((value) => value === null || value > Date.now(), 'La suscripcion ya expiro'),
  keys: z.object({
    p256dh: keySchema,
    auth: keySchema,
  }),
}).strict();

const deleteSchema = z.object({ endpoint: endpointSchema }).strict();

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const allowed = new Set([
    new URL(request.url).origin,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter((value): value is string => Boolean(value)).map((value) => value.replace(/\/$/, '')));

  return allowed.has(origin.replace(/\/$/, ''));
}

async function authenticatedUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Suscripcion push invalida' }, { status: 400 });
  }

  try {
    await savePushSubscription(userId, {
      ...parsed.data,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
    });
    return Response.json({ subscribed: true });
  } catch {
    return Response.json({ error: 'No fue posible guardar la suscripcion' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!originAllowed(request)) {
    return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Suscripcion push invalida' }, { status: 400 });
  }

  try {
    await deletePushSubscription(userId, parsed.data.endpoint);
    return Response.json({ subscribed: false });
  } catch {
    return Response.json({ error: 'No fue posible eliminar la suscripcion' }, { status: 503 });
  }
}
