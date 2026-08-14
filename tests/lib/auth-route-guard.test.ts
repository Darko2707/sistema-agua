import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ accountLimit: vi.fn() }));

vi.mock('@/lib/ratelimit', () => ({
  authAccountLimiter: { limit: mocks.accountLimit },
}));
vi.mock('@/lib/operational-alert', () => ({ reportOperationalFailure: vi.fn() }));

import { guardAuthAccountRequest } from '@/lib/auth-route-guard';
import { opaqueRateLimitKey } from '@/lib/request-security';

describe('auth account guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = 'auth-guard-test-secret';
  });

  it('rechaza cuerpos declarados mayores a 32 KiB antes de parsearlos', async () => {
    const response = await guardAuthAccountRequest(new Request(
      'https://example.test/api/auth/sign-in/email',
      { method: 'POST', headers: { 'content-length': String(32 * 1024 + 1) }, body: '{}' },
    ));
    expect(response?.status).toBe(413);
    expect(mocks.accountLimit).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/reset-password',
    '/api/auth/change-password',
    '/api/auth/delete-user',
  ])('mide y rechaza body sin Content-Length en ruta sensible %s', async (pathname) => {
    const request = new Request(`https://example.test${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(32 * 1024 + 1) }),
    });
    expect(request.headers.get('content-length')).toBeNull();

    const response = await guardAuthAccountRequest(request);

    expect(response?.status).toBe(413);
    expect(mocks.accountLimit).not.toHaveBeenCalled();
  });

  it('mide reset-password pequeno sin consumir el body original', async () => {
    const payload = { token: 'token', newPassword: 'Password segura 123' };
    const request = new Request('https://example.test/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await guardAuthAccountRequest(request);

    expect(response).toBeNull();
    expect(await request.json()).toEqual(payload);
    expect(mocks.accountLimit).not.toHaveBeenCalled();
  });

  it.each([
    '/api/auth/get-session',
    '/api/auth/callback/google',
    '/api/auth/sign-out',
  ])('no inspecciona ni limita %s', async (pathname) => {
    const response = await guardAuthAccountRequest(new Request(
      `https://example.test${pathname}`,
      { method: 'POST', headers: { 'content-length': String(64 * 1024) }, body: '{}' },
    ));
    expect(response).toBeNull();
    expect(mocks.accountLimit).not.toHaveBeenCalled();
  });

  it('limita por HMAC del correo normalizado', async () => {
    mocks.accountLimit.mockResolvedValueOnce({
      success: true,
      limit: 15,
      remaining: 14,
      reset: Date.now() + 60_000,
    });
    const request = new Request(
      'https://example.test/api/auth/sign-in/email',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ' Resident@Example.com ', password: 'secret' }),
      },
    );
    const response = await guardAuthAccountRequest(request);
    expect(response).toBeNull();
    expect(mocks.accountLimit).toHaveBeenCalledWith(
      opaqueRateLimitKey('account', 'resident@example.com'),
    );
    expect(await request.json()).toEqual({
      email: ' Resident@Example.com ',
      password: 'secret',
    });
  });
});
