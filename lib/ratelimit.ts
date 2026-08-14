import { Ratelimit } from '@upstash/ratelimit';

import { upstashNamespace, upstashRedis } from '@/lib/upstash';

type Window = `${number} ${'s' | 'm' | 'h' | 'd'}`;

function configuredLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : fallback;
}

function makeLimiter(scope: string, requests: number, window: Window): Ratelimit | null {
  if (!upstashRedis) return null;
  return new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: false,
    prefix: upstashNamespace(`ratelimit-${scope}`),
  });
}

// Network and account buckets are deliberately independent. Account keys must
// be opaqueRateLimitKey() hashes at the call site, never raw emails/user ids.
export const authLimiter = makeLimiter(
  'auth-ip',
  configuredLimit('AUTH_IP_RATE_LIMIT', 30),
  '1 m',
);
export const authAccountLimiter = makeLimiter(
  'auth-account',
  configuredLimit('AUTH_ACCOUNT_RATE_LIMIT', 15),
  '10 m',
);

export const trpcIpLimiter = makeLimiter(
  'trpc-ip',
  configuredLimit('TRPC_IP_RATE_LIMIT', 120),
  '1 m',
);
export const trpcAccountLimiter = makeLimiter(
  'trpc-account',
  configuredLimit('TRPC_ACCOUNT_RATE_LIMIT', 120),
  '1 m',
);

export const checkoutLimiter = makeLimiter(
  'checkout-ip',
  configuredLimit('CHECKOUT_IP_RATE_LIMIT', 5),
  '1 m',
);
export const checkoutAccountLimiter = makeLimiter(
  'checkout-account',
  configuredLimit('CHECKOUT_ACCOUNT_RATE_LIMIT', 5),
  '1 m',
);

export const ticketLimiter = makeLimiter(
  'tickets-ip',
  configuredLimit('TICKET_IP_RATE_LIMIT', 60),
  '1 m',
);
export const ticketAccountLimiter = makeLimiter(
  'ticket-pdf-account',
  configuredLimit('TICKET_ACCOUNT_RATE_LIMIT', 20),
  '10 m',
);
export const reportIpLimiter = makeLimiter(
  'reports-ip',
  configuredLimit('REPORT_IP_RATE_LIMIT', 20),
  '10 m',
);
export const reportAccountLimiter = makeLimiter(
  'reports-account',
  configuredLimit('REPORT_ACCOUNT_RATE_LIMIT', 6),
  '10 m',
);

// Representative-assisted reset has distinct namespaces for each phase and
// identity dimension, preventing one bucket/configuration from polluting another.
export const representativeResetRequestIpLimiter = makeLimiter(
  'representative-reset-request-ip',
  configuredLimit('RESET_REQUEST_IP_RATE_LIMIT', 10),
  '10 m',
);
export const representativeResetRequestAccountLimiter = makeLimiter(
  'representative-reset-request-account',
  configuredLimit('RESET_REQUEST_ACCOUNT_RATE_LIMIT', 5),
  '10 m',
);
export const representativeResetRedeemIpLimiter = makeLimiter(
  'representative-reset-redeem-ip',
  configuredLimit('RESET_REDEEM_RATE_LIMIT', 10),
  '10 m',
);
export const representativeResetRedeemAccountLimiter = makeLimiter(
  'representative-reset-redeem-account',
  configuredLimit('RESET_REDEEM_ACCOUNT_RATE_LIMIT', 10),
  '10 m',
);
export const representativeResetGenerateIpLimiter = makeLimiter(
  'representative-reset-generate-ip',
  configuredLimit('RESET_GENERATE_RATE_LIMIT', 10),
  '10 m',
);
export const representativeResetGenerateAccountLimiter = makeLimiter(
  'representative-reset-generate-account',
  configuredLimit('RESET_GENERATE_ACCOUNT_RATE_LIMIT', 10),
  '10 m',
);

// Compatibility aliases while callers migrate from a combined account+IP key.
export const representativeResetRedeemLimiter = representativeResetRedeemAccountLimiter;
export const representativeResetGenerateLimiter = representativeResetGenerateAccountLimiter;
