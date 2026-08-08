import { createHash, timingSafeEqual } from 'crypto';
import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { user, verification } from '@/db/schema';
import { auth } from '@/lib/auth';
import { authLimiter } from '@/lib/ratelimit';
import { formatPhoneForWhatsApp } from '@/lib/whatsapp';

function hashCode(code: string) {
  return createHash('sha256')
    .update(`${code}:${process.env.BETTER_AUTH_SECRET ?? 'dev-secret'}`)
    .digest('hex');
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

export async function POST(req: NextRequest) {
  const limit = await authLimiter?.limit(`whatsapp-verify:${getIp(req)}`);
  if (limit && !limit.success) {
    return Response.json({ error: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null) as { telefono?: string; code?: string } | null;
  const telefono = body?.telefono?.replace(/\D/g, '') ?? '';
  const code = body?.code?.replace(/\D/g, '') ?? '';

  if (telefono.length < 10 || telefono.length > 15 || code.length !== 6) {
    return Response.json({ error: 'Codigo invalido' }, { status: 400 });
  }

  const identifier = `whatsapp:${session.user.id}:${formatPhoneForWhatsApp(telefono)}`;
  const row = await db.query.verification.findFirst({
    where: and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())),
  });

  if (!row || !safeCompare(row.value, hashCode(code))) {
    return Response.json({ error: 'Codigo incorrecto o expirado' }, { status: 400 });
  }

  await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, session.user.id));
  await db.delete(verification).where(eq(verification.identifier, identifier));

  return Response.json({ ok: true });
}
