import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDeletePushSubscription,
  mockGetSession,
  mockSavePushSubscription,
} = vi.hoisted(() => ({
  mockDeletePushSubscription: vi.fn(),
  mockGetSession: vi.fn(),
  mockSavePushSubscription: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock('@/lib/push-subscriptions', () => ({
  deletePushSubscription: mockDeletePushSubscription,
  isAllowedPushEndpoint: (endpoint: string) =>
    endpoint.startsWith('https://fcm.googleapis.com/'),
  savePushSubscription: mockSavePushSubscription,
}));

import { DELETE, POST } from '@/app/api/push/subscriptions/route';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-token';
const VALID_SUBSCRIPTION = {
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: {
    p256dh: 'A'.repeat(87),
    auth: 'B'.repeat(22),
  },
};

function request(
  method: 'POST' | 'DELETE',
  body: unknown = VALID_SUBSCRIPTION,
  options?: { origin?: string | null; rawBody?: string; userAgent?: string },
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options?.origin !== null) {
    headers.set('origin', options?.origin ?? 'https://app.example');
  }
  if (options?.userAgent) headers.set('user-agent', options.userAgent);

  return new Request('https://app.example/api/push/subscriptions', {
    method,
    headers,
    body: options?.rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
  mockSavePushSubscription.mockResolvedValue(undefined);
  mockDeletePushSubscription.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('POST /api/push/subscriptions', () => {
  it('devuelve 401 cuando no existe una sesion', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(request('POST'));

    expect(response.status).toBe(401);
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it('rechaza un origen ajeno antes de consultar la sesion', async () => {
    const response = await POST(request('POST', VALID_SUBSCRIPTION, {
      origin: 'https://attacker.example',
    }));

    expect(response.status).toBe(403);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it('devuelve 400 cuando el JSON no se puede analizar', async () => {
    const response = await POST(request('POST', null, { rawBody: '{' }));

    expect(response.status).toBe(400);
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it('devuelve 400 cuando el cuerpo no cumple el esquema estricto', async () => {
    const response = await POST(request('POST', {
      ...VALID_SUBSCRIPTION,
      keys: { p256dh: 'corta', auth: 'tambien-corta' },
      campoInesperado: true,
    }));

    expect(response.status).toBe(400);
    expect(mockSavePushSubscription).not.toHaveBeenCalled();
  });

  it('guarda una suscripcion valida para el usuario autenticado', async () => {
    const userAgent = 'navegador-prueba/1.0';

    const response = await POST(request('POST', VALID_SUBSCRIPTION, { userAgent }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subscribed: true });
    expect(mockSavePushSubscription).toHaveBeenCalledWith('user-123', {
      ...VALID_SUBSCRIPTION,
      userAgent,
    });
  });

  it('limita el user-agent almacenado a 300 caracteres', async () => {
    await POST(request('POST', VALID_SUBSCRIPTION, { userAgent: 'x'.repeat(350) }));

    expect(mockSavePushSubscription).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ userAgent: 'x'.repeat(300) }),
    );
  });
});

describe('DELETE /api/push/subscriptions', () => {
  it('devuelve 401 cuando no existe una sesion', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }));

    expect(response.status).toBe(401);
    expect(mockDeletePushSubscription).not.toHaveBeenCalled();
  });

  it('rechaza un origen ajeno', async () => {
    const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }, {
      origin: 'https://attacker.example',
    }));

    expect(response.status).toBe(403);
    expect(mockDeletePushSubscription).not.toHaveBeenCalled();
  });

  it('devuelve 400 para un endpoint no permitido', async () => {
    const response = await DELETE(request('DELETE', {
      endpoint: 'https://attacker.example/push',
    }));

    expect(response.status).toBe(400);
    expect(mockDeletePushSubscription).not.toHaveBeenCalled();
  });

  it('elimina solamente la suscripcion indicada del usuario autenticado', async () => {
    const response = await DELETE(request('DELETE', { endpoint: ENDPOINT }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subscribed: false });
    expect(mockDeletePushSubscription).toHaveBeenCalledWith('user-123', ENDPOINT);
  });
});
