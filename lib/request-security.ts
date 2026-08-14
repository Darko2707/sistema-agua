import { createHash, createHmac } from 'node:crypto';

const MAX_IP_LENGTH = 64;
const IP_CHARACTERS = /^[0-9a-f:.]+$/i;

function firstValidIp(value: string | null): string | null {
  const candidate = value?.split(',')[0]?.trim();
  if (!candidate || candidate.length > MAX_IP_LENGTH || !IP_CHARACTERS.test(candidate)) {
    return null;
  }
  return candidate;
}

/**
 * Vercel documents x-vercel-forwarded-for as its canonical forwarding header.
 * In Vercel we do not fall back to caller-controlled forwarding headers when
 * the canonical value is absent.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const vercelIp = firstValidIp(headers.get('x-vercel-forwarded-for'));
  if (vercelIp) return vercelIp;

  const isVercelRuntime = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  if (isVercelRuntime) return 'anonymous';

  return firstValidIp(headers.get('x-forwarded-for'))
    ?? firstValidIp(headers.get('x-real-ip'))
    ?? 'anonymous';
}

/**
 * Keeps raw IPs, emails and user ids out of Redis key names. HMAC prevents an
 * offline dictionary attack against email keys if the Redis data is exposed.
 */
export function opaqueRateLimitKey(kind: 'ip' | 'account', value: string): string {
  const input = `${kind}\0${value.trim().toLowerCase()}`;
  const secret = process.env.RATE_LIMIT_KEY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('RATE_LIMIT_KEY_SECRET o BETTER_AUTH_SECRET no configurado');
  }
  const digest = secret
    ? createHmac('sha256', secret).update(input).digest('hex')
    : createHash('sha256').update(input).digest('hex');
  return `${kind}:${digest}`;
}
