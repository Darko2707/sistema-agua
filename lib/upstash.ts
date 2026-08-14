import { Redis } from '@upstash/redis';

function safeNamespacePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80) || 'unknown';
}

const deploymentEnvironment = safeNamespacePart(
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
);
const projectIdentifier = safeNamespacePart(
  process.env.VERCEL_PROJECT_ID ?? 'sistema-agua',
);

/**
 * Isolates Upstash keys by project, deployment environment and schema version.
 * Production and preview deployments can share Redis without sharing limits.
 */
export const UPSTASH_NAMESPACE = `sistema-agua:${projectIdentifier}:${deploymentEnvironment}:v1`;

export function upstashNamespace(scope: string): string {
  return `${UPSTASH_NAMESPACE}:${safeNamespacePart(scope)}`;
}

function createRedis(): Redis | null {
  // Unit tests must never consume a real Upstash database inherited from the
  // developer shell. Integration tests can opt in explicitly.
  if (process.env.NODE_ENV === 'test' && process.env.ALLOW_UPSTASH_TESTS !== '1') {
    return null;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export const upstashRedis = createRedis();
