import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function createRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = createRedis();

function makeLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(requests, window),
    analytics: false,
    prefix:    'rl',
  });
}

// Auth: 30 req/min por IP — bloquea fuerza bruta; margen para reintentos del cliente
export const authLimiter = makeLimiter(30, '1 m');

// tRPC: 120 req/min por IP — cubre dashboards con múltiples queries paralelas
export const trpcLimiter = makeLimiter(120, '1 m');

// Checkout: 5 req/min por IP — cada llamada crea una preferencia en MP
export const checkoutLimiter = makeLimiter(5, '1 m');
