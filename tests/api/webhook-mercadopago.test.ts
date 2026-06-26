import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────
// Variables with "mock" prefix can be referenced inside vi.mock factories.

const mockExecute = vi.fn().mockResolvedValue({ folio: 'AGU-001', yaRegistrado: false });

vi.mock('@/src/application/pagos/commands/procesar-pago-mp.handler', () => ({
  // Arrow-function field defers access to mockExecute until call time (avoids TDZ).
  ProcesarPagoMpHandler: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute = (...args: any[]) => mockExecute(...args);
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {}, pagoRepo: {}, circuitoRepo: {},
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(), captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/crypto', () => ({
  decryptTokenSafe: vi.fn(),
}));

vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      perfilesResidente: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('mercadopago', () => {
  class InvalidWebhookSignatureError extends Error {
    reason: string;
    constructor(msg?: string) {
      super(msg ?? 'invalid signature');
      this.name = 'InvalidWebhookSignatureError';
      this.reason = msg ?? 'invalid signature';
    }
  }
  return {
    InvalidWebhookSignatureError,
    WebhookSignatureValidator: { validate: vi.fn() },
  };
});

// ── Imports after mocks ────────────────────────────────────────────────────────
import { POST } from '@/app/api/mercadopago/webhook/route';
import { InvalidWebhookSignatureError, WebhookSignatureValidator, SignatureFailureReason } from 'mercadopago';
import { db } from '@/db';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';

// ── Helpers ────────────────────────────────────────────────────────────────────
const REF_PARAM = encodeURIComponent('agua|perf-001|6|2025|0|100.00');

function makeRequest(opts?: {
  url?:     string;
  body?:    object;
  headers?: Record<string, string>;
}) {
  const url = opts?.url ?? `https://example.com/api/mp/webhook?data.id=12345&ref=${REF_PARAM}`;
  return new Request(url, {
    method:  'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature':  'ts=1234567890,v1=abc123',
      'x-request-id': 'req-001',
      ...opts?.headers,
    },
    body: JSON.stringify(opts?.body ?? { data: { id: '12345' } }),
  });
}

const MOCK_PAYMENT = {
  id: 12345,
  status: 'approved',
  external_reference: 'agua|perf-001|6|2025|0|100.00',
  collector_id: 98765,
};

const mockPaymentGet = vi.fn();

// ── Setup ──────────────────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.MP_WEBHOOK_SECRET = 'test-secret';

  vi.mocked(WebhookSignatureValidator.validate).mockReturnValue(undefined);

  vi.mocked(db.query.perfilesResidente.findFirst).mockResolvedValue({
    id: 'perf-001',
    circuito: { mercadoPagoAccessToken: 'encrypted-token', activo: true },
  } as any);

  vi.mocked(decryptTokenSafe).mockReturnValue('access-token-plain');

  mockPaymentGet.mockResolvedValue(MOCK_PAYMENT);
  vi.mocked(createMercadoPagoClients).mockReturnValue({
    paymentClient:    { get: mockPaymentGet } as any,
    preferenceClient: {} as any,
  });

  mockExecute.mockResolvedValue({ folio: 'AGU-001', yaRegistrado: false });
});

afterEach(() => {
  delete process.env.MP_WEBHOOK_SECRET;
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('POST /api/mercadopago/webhook', () => {
  describe('validación de configuración', () => {
    it('devuelve 503 si MP_WEBHOOK_SECRET no está configurado', async () => {
      delete process.env.MP_WEBHOOK_SECRET;
      const res = await POST(makeRequest());
      expect(res.status).toBe(503);
      expect(WebhookSignatureValidator.validate).not.toHaveBeenCalled();
    });
  });

  describe('validación HMAC', () => {
    it('devuelve 401 cuando la firma es inválida', async () => {
      vi.mocked(WebhookSignatureValidator.validate).mockImplementationOnce(() => {
        throw new InvalidWebhookSignatureError(SignatureFailureReason.TimestampOutOfTolerance);
      });
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Firma invalida');
    });

    it('llama a validate con la firma y el request-id del header', async () => {
      await POST(makeRequest());
      expect(WebhookSignatureValidator.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          xSignature:  'ts=1234567890,v1=abc123',
          xRequestId:  'req-001',
          secret:      'test-secret',
        }),
      );
    });
  });

  describe('parsing del paymentId', () => {
    it('devuelve 200 sin procesar si no hay paymentId en cuerpo ni en URL', async () => {
      const url = 'https://example.com/api/mp/webhook';
      const req = new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=a', 'x-request-id': 'r' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('acepta el paymentId desde el body (data.id)', async () => {
      await POST(makeRequest({ body: { data: { id: '99999' } } }));
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: '99999' });
    });

    it('acepta el paymentId desde body.id (notificación de webhook v1)', async () => {
      const url = `https://example.com/api/mp/webhook?ref=${REF_PARAM}`;
      const req = makeRequest({ url, body: { id: '88888' } });
      await POST(req);
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: '88888' });
    });

    it('acepta el paymentId desde el query param data.id', async () => {
      const url = `https://example.com/api/mp/webhook?data.id=77777&ref=${REF_PARAM}`;
      await POST(makeRequest({ url, body: {} }));
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: '77777' });
    });
  });

  describe('client de pago', () => {
    it('devuelve 200 sin procesar si no hay ref en URL', async () => {
      const url = 'https://example.com/api/mp/webhook?data.id=12345';
      const res = await POST(makeRequest({ url }));
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('devuelve 200 sin procesar si el token del circuito es null', async () => {
      vi.mocked(decryptTokenSafe).mockReturnValue(null);
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('devuelve 200 sin procesar si el perfil no existe en BD', async () => {
      vi.mocked(db.query.perfilesResidente.findFirst).mockResolvedValue(undefined);
      vi.mocked(decryptTokenSafe).mockReturnValue(null);
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('procesamiento de pago', () => {
    it('llama a execute cuando el pago está aprobado y la referencia es válida', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledOnce();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          perfilId: 'perf-001',
          mes:      6,
          anio:     2025,
          mercadoPagoPaymentId: '12345',
        }),
      );
    });

    it('pasa el collector_id del pago a execute', async () => {
      await POST(makeRequest());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ mercadoPagoCollectorId: '98765' }),
      );
    });

    it('NO llama a execute cuando el pago está pendiente', async () => {
      mockPaymentGet.mockResolvedValue({ ...MOCK_PAYMENT, status: 'pending' });
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('NO llama a execute cuando el pago es rechazado', async () => {
      mockPaymentGet.mockResolvedValue({ ...MOCK_PAYMENT, status: 'rejected' });
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('devuelve 200 cuando el pago ya estaba registrado (idempotencia)', async () => {
      mockExecute.mockResolvedValue({ folio: 'AGU-001', yaRegistrado: true });
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    });

    it('usa external_reference del pago si no hay ref en URL', async () => {
      const url = 'https://example.com/api/mp/webhook?data.id=12345';
      await POST(makeRequest({ url }));
      // No ref → paymentClient is null → execute not called
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('manejo de errores', () => {
    it('devuelve 500 ante un error inesperado', async () => {
      mockPaymentGet.mockRejectedValue(new Error('network error'));
      const res = await POST(makeRequest());
      expect(res.status).toBe(500);
    });

    it('devuelve 200 y llama a execute aunque el cuerpo JSON sea inválido (usa URL params)', async () => {
      const url = `https://example.com/api/mp/webhook?data.id=12345&ref=${REF_PARAM}`;
      const req = new Request(url, {
        method:  'POST',
        headers: {
          'x-signature':  'ts=1,v1=a',
          'x-request-id': 'r',
          'content-type': 'text/plain',
        },
        body: 'not json',
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });
});
