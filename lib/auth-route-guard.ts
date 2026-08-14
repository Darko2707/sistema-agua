import { authAccountLimiter } from '@/lib/ratelimit';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit-guard';
import { readBodyCloneWithLimit } from '@/lib/request-body-limit';
import { opaqueRateLimitKey } from '@/lib/request-security';

// Paths where the request carries a stable account identifier. Session reads,
// OAuth callbacks and sign-out must never consume this bucket.
const ACCOUNT_CREDENTIAL_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-up/email',
  '/api/auth/request-password-reset',
  '/api/auth/forget-password',
  '/api/auth/change-email',
]);
const BODY_CAPPED_PATHS = new Set([
  ...ACCOUNT_CREDENTIAL_PATHS,
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/delete-user',
]);
const MAX_AUTH_BODY_BYTES = 32 * 1024;

function accountIdentifier(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as { email?: unknown; newEmail?: unknown };
  const value = typeof candidate.email === 'string'
    ? candidate.email
    : typeof candidate.newEmail === 'string'
      ? candidate.newEmail
      : null;
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 3 && normalized.length <= 320 ? normalized : null;
}

export async function guardAuthAccountRequest(request: Request): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!BODY_CAPPED_PATHS.has(pathname)) return null;

  const bodyRead = await readBodyCloneWithLimit(request, MAX_AUTH_BODY_BYTES);
  if (bodyRead.status === 'too_large') {
    return new Response('Payload Too Large', {
      status: 413,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  if (bodyRead.status === 'unreadable') {
    return new Response('Invalid Request Body', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  if (!ACCOUNT_CREDENTIAL_PATHS.has(pathname) || !authAccountLimiter) return null;

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bodyRead.bytes));
  } catch {
    // Better Auth owns malformed-body validation and its response shape.
    return null;
  }

  const account = accountIdentifier(body);
  if (!account) return null;
  const decision = await consumeRateLimit({
    limiter: authAccountLimiter,
    key: opaqueRateLimitKey('account', account),
    boundary: 'auth_route',
    scope: 'auth_account',
  });

  return decision && !decision.success ? rateLimitResponse(decision) : null;
}
