import { randomInt, createHash } from 'crypto';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { eq, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/db';
import { user, verification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { authLimiter } from '@/lib/ratelimit';
import { formatPhoneForWhatsApp, sendWhatsAppVerificationCode } from '@/lib/whatsapp';

function hashCode(code: string) {
  return createHash('sha256')
    .update(`${code}:${process.env.BETTER_AUTH_SECRET ?? 'dev-secret'}`)
    .digest('hex');
}

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

export async function POST(req: NextRequest) {
  const limit = await authLimiter?.limit(`whatsapp-send:${getIp(req)}`);
  if (limit && !limit.success) {
    return Response.json({ error: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null) as { telefono?: string } | null;
  const telefono = body?.telefono?.replace(/\D/g, '') ?? '';
  if (telefono.length < 10 || telefono.length > 15) {
    return Response.json({ error: 'Telefono invalido' }, { status: 400 });
  }

  const code = String(randomInt(100000, 999999));
  const normalizedPhone = formatPhoneForWhatsApp(telefono);
  const identifier = `whatsapp:${session.user.id}:${normalizedPhone}`;

  await db.delete(verification).where(like(verification.identifier, `whatsapp:${session.user.id}:%`));
  await db.insert(verification).values({
    id: nanoid(),
    identifier,
    value: hashCode(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  await db.update(user).set({ emailVerified: false, updatedAt: new Date() }).where(eq(user.id, session.user.id));

  const result = await sendWhatsAppVerificationCode(telefono, code);

  return Response.json({
    ok: true,
    devCode: result.provider === 'dev' ? result.code : undefined,
  });
}
