import { afterEach, describe, expect, it, vi } from 'vitest';

import { sentryEnvironment } from '@/lib/sentry-config';

describe('sentryEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefiere el ambiente publico configurado para separar staging de produccion', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging');
    vi.stubEnv('SENTRY_ENVIRONMENT', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(sentryEnvironment()).toBe('staging');
  });

  it('usa VERCEL_ENV cuando no hay ambiente explicito', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    expect(sentryEnvironment()).toBe('preview');
  });
});
