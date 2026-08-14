import { afterEach, describe, expect, it } from 'vitest';

import { clientIpFromHeaders, opaqueRateLimitKey } from '@/lib/request-security';

const ORIGINALS = {
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINALS)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('request security', () => {
  it('usa el header canonico de Vercel sobre headers falsificables', () => {
    process.env.VERCEL = '1';
    expect(clientIpFromHeaders(new Headers({
      'x-vercel-forwarded-for': '203.0.113.4',
      'x-forwarded-for': '198.51.100.2',
      'x-real-ip': '192.0.2.8',
    }))).toBe('203.0.113.4');
  });

  it('no confia en fallbacks si Vercel omite su header canonico', () => {
    process.env.VERCEL_ENV = 'production';
    expect(clientIpFromHeaders(new Headers({
      'x-forwarded-for': '198.51.100.2',
    }))).toBe('anonymous');
  });

  it('permite fallback local fuera de Vercel', () => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    expect(clientIpFromHeaders(new Headers({
      'x-forwarded-for': '198.51.100.2, 10.0.0.1',
    }))).toBe('198.51.100.2');
  });

  it('usa HMAC y no incluye la identidad en la llave', () => {
    process.env.BETTER_AUTH_SECRET = 'secret-a';
    const first = opaqueRateLimitKey('account', 'resident@example.com');
    process.env.BETTER_AUTH_SECRET = 'secret-b';
    const second = opaqueRateLimitKey('account', 'resident@example.com');
    expect(first).not.toContain('resident@example.com');
    expect(first).not.toBe(second);
  });
});
