import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchHandler: vi.fn(),
  createContext: vi.fn(),
  ipLimit: vi.fn(),
  accountLimit: vi.fn(),
  ticketLimit: vi.fn(),
  reportLimit: vi.fn(),
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
}));

vi.mock('@trpc/server/adapters/fetch', () => ({
  fetchRequestHandler: mocks.fetchHandler,
}));
vi.mock('@/server/routers', () => ({ appRouter: {} }));
vi.mock('@/server/trpc', () => ({ createTRPCContext: mocks.createContext }));
vi.mock('@/lib/ratelimit', () => ({
  trpcIpLimiter: { limit: mocks.ipLimit },
  trpcAccountLimiter: { limit: mocks.accountLimit },
  ticketLimiter: { limit: mocks.ticketLimit },
  reportAccountLimiter: { limit: mocks.reportLimit },
}));
vi.mock('@/lib/concurrency-guard', () => ({
  acquireConcurrencyLease: mocks.acquireLease,
}));
vi.mock('@/lib/operational-alert', () => ({ reportOperationalFailure: vi.fn() }));

import { GET, POST } from '@/app/api/trpc/[trpc]/route';

const allowed = () => ({
  success: true,
  limit: 120,
  remaining: 119,
  reset: Date.now() + 60_000,
});

describe('tRPC HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL = '1';
    process.env.BETTER_AUTH_SECRET = 'trpc-route-test-secret';
    mocks.ipLimit.mockResolvedValue(allowed());
    mocks.accountLimit.mockResolvedValue(allowed());
    mocks.ticketLimit.mockResolvedValue(allowed());
    mocks.reportLimit.mockResolvedValue(allowed());
    mocks.createContext.mockResolvedValue({
      user: { id: 'user-1' },
      headers: new Headers(),
    });
    mocks.acquireLease.mockImplementation(async () => ({
      acquired: true,
      release: mocks.releaseLease,
    }));
    mocks.fetchHandler.mockResolvedValue(new Response('ok'));
  });

  it('rechaza Content-Length mayor a 256 KiB antes de auth, Redis y parseo', async () => {
    const response = await POST(new Request('https://example.test/api/trpc/usuarios.miPerfil', {
      method: 'POST',
      headers: { 'content-length': String(256 * 1024 + 1) },
      body: '{}',
    }));
    expect(response.status).toBe(413);
    expect(mocks.ipLimit).not.toHaveBeenCalled();
    expect(mocks.createContext).not.toHaveBeenCalled();
    expect(mocks.fetchHandler).not.toHaveBeenCalled();
  });

  it('mide y rechaza POST sobredimensionado sin Content-Length', async () => {
    const request = new Request('https://example.test/api/trpc/usuarios.miPerfil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(256 * 1024 + 1) }),
    });
    expect(request.headers.get('content-length')).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.ipLimit).not.toHaveBeenCalled();
    expect(mocks.createContext).not.toHaveBeenCalled();
    expect(mocks.fetchHandler).not.toHaveBeenCalled();
  });

  it('preserva el body POST original para el adapter tRPC', async () => {
    const payload = { input: { perfilId: 'test' } };
    mocks.fetchHandler.mockImplementationOnce(async ({ req }: { req: Request }) => {
      return Response.json(await req.json());
    });
    const request = new Request('https://example.test/api/trpc/usuarios.miPerfil', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vercel-forwarded-for': '203.0.113.4',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
  });

  it('impone maxBatchSize 10 y leases por IP y cuenta autenticada', async () => {
    const response = await GET(new Request(
      'https://example.test/api/trpc/usuarios.miPerfil,pagos.misPagos?batch=1',
      { headers: { 'x-vercel-forwarded-for': '203.0.113.5' } },
    ));
    expect(response.status).toBe(200);
    expect(mocks.fetchHandler).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: '/api/trpc',
      maxBatchSize: 10,
    }));
    expect(mocks.acquireLease).toHaveBeenNthCalledWith(1, expect.objectContaining({
      scope: 'trpc-ip',
      maxConcurrent: 8,
    }));
    expect(mocks.acquireLease).toHaveBeenNthCalledWith(2, expect.objectContaining({
      scope: 'trpc-account',
      accountId: 'user-1',
      maxConcurrent: 4,
    }));
    expect(mocks.releaseLease).toHaveBeenCalledTimes(2);
  });

  it.each(['GET', 'POST'] as const)(
    'aplica el bucket especial a tickets.verificar en %s batch',
    async (method) => {
      mocks.createContext.mockResolvedValueOnce({ user: null, headers: new Headers() });
      const request = new Request(
        'https://example.test/api/trpc/tickets.verificar,usuarios.listarCircuitos?batch=1',
        {
          method,
          headers: { 'x-vercel-forwarded-for': '203.0.113.6' },
          ...(method === 'POST' ? { body: '{}' } : {}),
        },
      );
      const response = method === 'POST' ? await POST(request) : await GET(request);
      expect(response.status).toBe(200);
      expect(mocks.ticketLimit).toHaveBeenCalledTimes(1);
      expect(mocks.ipLimit).toHaveBeenCalledTimes(1);
      expect(mocks.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
        scope: 'trpc-ip',
      }));
    },
  );

  it('trata escapes malformados como path desconocido sin omitir el limite generico', async () => {
    mocks.createContext.mockResolvedValueOnce({ user: null, headers: new Headers() });
    const response = await GET(new Request(
      'https://example.test/api/trpc/%E0%A4%A',
      { headers: { 'x-vercel-forwarded-for': '203.0.113.7' } },
    ));
    expect(response.status).toBe(200);
    expect(mocks.ipLimit).toHaveBeenCalledTimes(1);
    expect(mocks.ticketLimit).not.toHaveBeenCalled();
  });

  it('serializa exportacionCompleta y consume su bucket dedicado', async () => {
    await GET(new Request(
      'https://example.test/api/trpc/operacion.exportacionCompleta',
      { headers: { 'x-vercel-forwarded-for': '203.0.113.8' } },
    ));
    expect(mocks.reportLimit).toHaveBeenCalledTimes(1);
    expect(mocks.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'full-export-account',
      maxConcurrent: 1,
    }));
  });
});
