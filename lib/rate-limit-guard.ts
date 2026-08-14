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
}): Promise<RateLimitDecision | null> {
  if (!input.limiter) return null;
  try {
    return await input.limiter.limit(input.key);
  } catch (error) {
    reportOperationalFailure({
      component: 'rate_limit',
      boundary: input.boundary,
      scope: input.scope,
      error,
      failOpen: true,
    });
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
