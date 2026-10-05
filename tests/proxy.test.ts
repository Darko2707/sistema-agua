import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authLimit: vi.fn(),
  checkoutLimit: vi.fn(),
  reportLimit: vi.fn(),
  ticketLimit: vi.fn(),
  loggerError: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  authLimiter: { limit: mocks.authLimit },
  checkoutLimiter: { limit: mocks.checkoutLimit },
  reportIpLimiter: { limit: mocks.reportLimit },
  ticketLimiter: { limit: mocks.ticketLimit },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.captureMessage,
}));

import { resetOperationalAlertThrottleForTests } from '@/lib/operational-alert';
import { opaqueRateLimitKey } from '@/lib/request-security';
import { config, proxy } from '@/proxy';

const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;
const ORIGINAL_MAINTENANCE = process.env.MAINTENANCE_MODE;

describe('Proxy rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOperationalAlertThrottleForTests();
    process.env.VERCEL = '1';
    process.env.BETTER_AUTH_SECRET = 'test-rate-limit-secret';
    delete process.env.MAINTENANCE_MODE;
  });

  afterEach(() => {
    if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = ORIGINAL_VERCEL;
    if (ORIGINAL_SECRET === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_MAINTENANCE === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = ORIGINAL_MAINTENANCE;
  });

  it.each([
    {
      url: 'https://example.test/api/auth/sign-in/email',
      scope: 'auth',
      limit: mocks.authLimit,
    },
    {
      url: 'https://example.test/api/mercadopago/checkout',
      scope: 'checkout',
      limit: mocks.checkoutLimit,
    },
    {
      url: 'https://example.test/api/mercadopago/servicios/checkout',
      scope: 'checkout',
      limit: mocks.checkoutLimit,
    },
    {
      url: 'https://example.test/api/mercadopago/return',
      scope: 'checkout',
      limit: mocks.checkoutLimit,
    },
    {
      url: 'https://example.test/api/reportes/financiero',
      scope: 'reports',
      limit: mocks.reportLimit,
    },
    {
      url: 'https://example.test/verificar/ABC-123',
      scope: 'tickets',
      limit: mocks.ticketLimit,
    },
  ])('permite $scope y emite telemetria agrupada si Redis falla', async ({ url, scope, limit }) => {
    const sensitiveIp = '203.0.113.42';
    const providerDetail = 'detalle sensible del proveedor';
    limit.mockRejectedValueOnce(new Error(providerDetail));

    const response = await proxy(new NextRequest(url, {
      headers: { 'x-vercel-forwarded-for': sensitiveIp },
    }));

    expect(response.status).toBe(200);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'rate_limit.proxy.unavailable',
      undefined,
      { scope, failureType: 'Error', failOpen: true },
    );
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      'rate_limit unavailable; request allowed',
      expect.objectContaining({
        level: 'error',
        fingerprint: ['operational', 'rate_limit', 'proxy', scope],
        tags: expect.objectContaining({ scope, fail_open: 'true' }),
        extra: { failureType: 'Error' },
      }),
    );

    const telemetry = JSON.stringify({
      logs: mocks.loggerError.mock.calls,
      sentry: mocks.captureMessage.mock.calls,
    });
    expect(telemetry).not.toContain(sensitiveIp);
    expect(telemetry).not.toContain(providerDetail);
  });

  it('prefiere x-vercel-forwarded-for y no confia en un x-forwarded-for falsificado', async () => {
    const decision = { success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 };
    mocks.authLimit.mockResolvedValueOnce(decision);

    await proxy(new NextRequest('https://example.test/api/auth/sign-in/email', {
      headers: {
        'x-vercel-forwarded-for': '203.0.113.10',
        'x-forwarded-for': '198.51.100.99',
      },
    }));

    expect(mocks.authLimit).toHaveBeenCalledWith(
      opaqueRateLimitKey('ip', '203.0.113.10'),
    );
  });

  it.each([
    '/api/mercadopago/webhook',
    '/api/cron/cortes',
    '/api/cron/notificaciones',
    '/api/auth/get-session',
    '/api/auth/callback/google',
    '/api/auth/sign-out',
  ])('no aplica ningun limitador de Proxy a %s', async (pathname) => {
    const response = await proxy(new NextRequest(`https://example.test${pathname}`));
    expect(response.status).toBe(200);
    expect(mocks.authLimit).not.toHaveBeenCalled();
    expect(mocks.checkoutLimit).not.toHaveBeenCalled();
    expect(mocks.reportLimit).not.toHaveBeenCalled();
    expect(mocks.ticketLimit).not.toHaveBeenCalled();
  });

  it('no incluye webhook, cron ni endpoints de sesion en el matcher estatico', () => {
    const matchers = JSON.stringify(config.matcher);
    expect(matchers).not.toContain('webhook');
    expect(matchers).not.toContain('/api/cron');
    expect(matchers).not.toContain('get-session');
    expect(matchers).not.toContain('callback');
    expect(matchers).not.toContain('sign-out');
  });

  it('devuelve 503 para API de usuario durante mantenimiento', async () => {
    process.env.MAINTENANCE_MODE = 'true';

    const response = await proxy(new NextRequest('https://example.test/api/trpc/usuarios.listar'));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('300');
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Servicio temporalmente en mantenimiento',
    });
  });

  it('redirige paginas a mantenimiento y evita un ciclo de redireccion', async () => {
    process.env.MAINTENANCE_MODE = 'TRUE';

    const redirected = await proxy(new NextRequest('https://example.test/admin?tab=usuarios'));
    const maintenance = await proxy(new NextRequest('https://example.test/mantenimiento'));

    expect(redirected.status).toBe(307);
    expect(redirected.headers.get('location')).toBe('https://example.test/mantenimiento');
    expect(maintenance.status).toBe(200);
  });

  it.each([
    '/api/health',
    '/api/mercadopago/webhook',
    '/api/cron/cortes',
  ])('mantiene disponible %s durante mantenimiento', async (pathname) => {
    process.env.MAINTENANCE_MODE = 'true';

    const response = await proxy(new NextRequest(`https://example.test${pathname}`));

    expect(response.status).toBe(200);
  });

  it('excluye recursos estaticos del matcher general', () => {
    const [matcher] = config.matcher;
    expect(config.matcher).toHaveLength(1);
    expect(matcher).toContain('_next/static');
    expect(matcher).toContain('_next/image');
    expect(matcher).toContain('sw.js');
  });
});
