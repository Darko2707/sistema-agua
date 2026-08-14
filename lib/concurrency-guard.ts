import { randomUUID } from 'node:crypto';

import { reportOperationalFailure } from '@/lib/operational-alert';
import { opaqueRateLimitKey } from '@/lib/request-security';
import { upstashNamespace, upstashRedis } from '@/lib/upstash';

const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local token = ARGV[3]
local maxConcurrent = tonumber(ARGV[4])
local keyTtl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
if redis.call('ZCARD', key) >= maxConcurrent then
  return 0
end
redis.call('ZADD', key, expiresAt, token)
redis.call('PEXPIRE', key, keyTtl)
return 1
`;

const RELEASE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`;

export type ConcurrencyLease = {
  acquired: boolean;
  release: () => Promise<void>;
};

export async function acquireConcurrencyLease(input: {
  scope: string;
  accountId: string;
  maxConcurrent: number;
  ttlMs: number;
  boundary: string;
}): Promise<ConcurrencyLease> {
  if (!upstashRedis) return { acquired: true, release: async () => undefined };
  const redis = upstashRedis;

  const token = randomUUID();
  const identity = opaqueRateLimitKey('account', input.accountId);
  const key = `${upstashNamespace(`concurrency-${input.scope}`)}:${identity}`;
  const now = Date.now();

  try {
    const acquired = await redis.eval<[number, number, string, number, number], number>(
      ACQUIRE_SCRIPT,
      [key],
      [now, now + input.ttlMs, token, input.maxConcurrent, input.ttlMs * 2],
    );

    if (acquired !== 1) {
      return { acquired: false, release: async () => undefined };
    }
  } catch (error) {
    reportOperationalFailure({
      component: 'concurrency_guard',
      boundary: input.boundary,
      scope: input.scope,
      error,
      failOpen: true,
    });
    return { acquired: true, release: async () => undefined };
  }

  let released = false;
  return {
    acquired: true,
    async release() {
      if (released) return;
      released = true;
      try {
        await redis.eval<[string], number>(RELEASE_SCRIPT, [key], [token]);
      } catch (error) {
        reportOperationalFailure({
          component: 'concurrency_guard',
          boundary: input.boundary,
          scope: `${input.scope}_release`,
          error,
          failOpen: true,
        });
      }
    },
  };
}
