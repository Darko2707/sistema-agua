import type { Ratelimit } from '@upstash/ratelimit';

import { reportOperationalFailure } from '@/lib/operational-alert';

export type RateLimitDecision = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export async function consumeRateLimit(input: {
  limiter: Ratelimit | null;
  key: string;
  boundary: string;
  scope: string;
  /** Sensitive flows must block when the limiter is unavailable. */
  failOpen?: boolean;
}): Promise<RateLimitDecision | null> {
  const mustFailClosed = input.failOpen === false && process.env.NODE_ENV === 'production';
  if (!input.limiter) {
    if (mustFailClosed) {
      return { success: false, limit: 0, remaining: 0, reset: Date.now() + 60_000 };
    }
    return null;
  }
  try {
    return await input.limiter.limit(input.key);
  } catch (error) {
    reportOperationalFailure({
      component: 'rate_limit',
      boundary: input.boundary,
      scope: input.scope,
      error,
      failOpen: !mustFailClosed,
    });
    if (mustFailClosed) {
      return {
        success: false,
        limit: 0,
        remaining: 0,
        reset: Date.now() + 60_000,
      };
    }
    return null;
  }
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
    'X-RateLimit-Reset': String(decision.reset),
  };
}

export function rateLimitResponse(decision: RateLimitDecision): Response {
  const retryAfter = Math.max(1, Math.ceil((decision.reset - Date.now()) / 1000));
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      ...rateLimitHeaders(decision),
      'Retry-After': String(retryAfter),
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
