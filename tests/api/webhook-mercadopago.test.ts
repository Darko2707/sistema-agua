import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────
// Variables with "mock" prefix can be referenced inside vi.mock factories.

const mockExecute = vi.fn().mockResolvedValue({ folio: 'AGU-001', yaRegistrado: false });
const mockSchedulePushDispatch = vi.fn();
const mockFindPaymentIntent = vi.fn();

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

vi.mock('@/lib/push-dispatcher', () => ({
  schedulePushDispatch: () => mockSchedulePushDispatch(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptTokenSafe: vi.fn(),
}));

vi.mock('@/lib/mercadopago', () => ({
  createMercadoPagoClients: vi.fn(),
}));

vi.mock('@/src/infrastructure/mercadopago/payment-intent', () => ({
  isMercadoPagoPaymentIntentReference: (value: string) => /^agua_[a-f0-9]{48}$/.test(value),
  findMercadoPagoPaymentIntent: (...args: unknown[]) => mockFindPaymentIntent(...args),
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
  const SignatureFailureReason = {
    MissingSignatureHeader:   'MissingSignatureHeader',
    MalformedSignatureHeader: 'MalformedSignatureHeader',
    MissingTimestamp:         'MissingTimestamp',
    MissingHash:              'MissingHash',
    SignatureMismatch:        'SignatureMismatch',
    TimestampOutOfTolerance:  'TimestampOutOfTolerance',
  };
  return {
    InvalidWebhookSignatureError,
    SignatureFailureReason,
    WebhookSignatureValidator: { validate: vi.fn() },
  };
});

// ── Imports after mocks ────────────────────────────────────────────────────────
import { POST } from '@/app/api/mercadopago/webhook/route';
import { InvalidWebhookSignatureError, WebhookSignatureValidator, SignatureFailureReason } from 'mercadopago';
import { db } from '@/db';
import { createMercadoPagoClients } from '@/lib/mercadopago';
import { decryptTokenSafe } from '@/lib/crypto';
import { MercadoPagoPeriodConflictError } from '@/src/application/pagos/errors/mercado-pago-period-conflict.error';
import * as Sentry from '@sentry/nextjs';

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
  currency_id: 'MXN',
  transaction_amount: 120.91,
};

const mockPaymentGet = vi.fn();

// ── Setup ──────────────────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.MP_WEBHOOK_SECRET = 'test-secret';
  mockFindPaymentIntent.mockResolvedValue(null);

  vi.mocked(WebhookSignatureValidator.validate).mockReturnValue(undefined);

  vi.mocked(db.query.perfilesResidente.findFirst).mockResolvedValue({
    id: 'perf-001',
    circuitoId: 'circuito-001',
    circuito: {
      id: 'circuito-001',
      mercadoPagoAccessToken: 'encrypted-token',
      mercadoPagoCollectorId: '98765',
      montoMensual: '100.00',
      montoReconexion: '300.00',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  vi.mocked(decryptTokenSafe).mockReturnValue('access-token-plain');

  mockPaymentGet.mockResolvedValue(MOCK_PAYMENT);
  vi.mocked(createMercadoPagoClients).mockReturnValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paymentClient:    { get: mockPaymentGet } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          dataId:      '12345',
          secret:      'test-secret',
        }),
      );
    });
  });

  describe('parsing del paymentId', () => {
    it('devuelve 400 sin procesar si falta el data.id firmado de la URL', async () => {
      const url = 'https://example.com/api/mp/webhook';
      const req = new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=a', 'x-request-id': 'r' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza body data.id distinto del data.id firmado', async () => {
      const res = await POST(makeRequest({ body: { data: { id: '99999' } } }));
      expect(res.status).toBe(400);
      expect(mockPaymentGet).not.toHaveBeenCalled();
    });

    it('no acepta body.id como reemplazo del data.id firmado', async () => {
      const url = `https://example.com/api/mp/webhook?ref=${REF_PARAM}`;
      const req = makeRequest({ url, body: { id: '88888' } });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(mockPaymentGet).not.toHaveBeenCalled();
    });

    it('acepta IDs del body solamente cuando coinciden con el firmado', async () => {
      const res = await POST(makeRequest({ body: { data: { id: 12345 }, id: '12345' } }));
      expect(res.status).toBe(200);
      expect(mockPaymentGet).toHaveBeenCalledWith({ id: '12345' });
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
          circuitoId: 'circuito-001',
          periodos: [{ mes: 6, anio: 2025, monto: '100.00', esReconexion: false }],
          mercadoPagoPaymentId: '12345',
        }),
      );
    });

    it('recalcula los montos desde el circuito y no confia en el monto de la referencia', async () => {
      const reference = 'agua|perf-001|6|2025|0|1.00';
      mockPaymentGet.mockResolvedValue({
        ...MOCK_PAYMENT,
        external_reference: reference,
      });
      const url = `https://example.com/api/mp/webhook?data.id=12345&ref=${encodeURIComponent(reference)}`;

      const res = await POST(makeRequest({ url }));

      expect(res.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
        periodos: [{ mes: 6, anio: 2025, monto: '100.00', esReconexion: false }],
      }));
    });

    it('incluye la reconexion configurada al validar y construir el primer periodo', async () => {
      const reference = 'agua3|perf-001|202506|1|100.00|300.00';
      mockPaymentGet.mockResolvedValue({
        ...MOCK_PAYMENT,
        external_reference: reference,
        transaction_amount: 469.71,
      });
      const url = `https://example.com/api/mp/webhook?data.id=12345&ref=${encodeURIComponent(reference)}`;

      const res = await POST(makeRequest({ url }));

      expect(res.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
        periodos: [{ mes: 6, anio: 2025, monto: '400.00', esReconexion: true }],
      }));
    });

    it('procesa una referencia de doce meses en una sola llamada batch', async () => {
      const reference = 'agua2|perf-001|7|2025|12|0|100.00|0.00';
      mockPaymentGet.mockResolvedValue({
        ...MOCK_PAYMENT,
        external_reference: reference,
        transaction_amount: 1399.84,
      });
      const url = `https://example.com/api/mp/webhook?data.id=12345&ref=${encodeURIComponent(reference)}`;

      const res = await POST(makeRequest({ url }));

      expect(res.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledOnce();
      const command = mockExecute.mock.calls[0][0];
      expect(command.periodos).toHaveLength(12);
      expect(command.periodos[0]).toEqual({ mes: 7, anio: 2025, monto: '100.00', esReconexion: false });
      expect(command.periodos[11]).toEqual({ mes: 6, anio: 2026, monto: '100.00', esReconexion: false });
      expect(mockSchedulePushDispatch).toHaveBeenCalledOnce();
    });

    it('acredita doce meses desde una intencion opaca sin exceder el contrato de referencia', async () => {
      const reference = `agua_${'a'.repeat(48)}`;
      const periodos = Array.from({ length: 12 }, (_, index) => ({
        mes: ((7 - 1 + index) % 12) + 1,
        anio: 2026 + Math.floor((7 - 1 + index) / 12),
        monto: '100.00',
        esReconexion: false,
      }));
      mockFindPaymentIntent.mockResolvedValue({
        externalReference: reference,
        perfilId: 'perf-001',
        circuitoId: 'circuito-001',
        periodos,
        total: '1399.84',
        currency: 'MXN',
        collectorId: '98765',
        expiresAt: new Date('2026-08-09T18:20:00.000Z'),
        mercadoPagoPaymentId: null,
        consumedAt: null,
        createdAt: new Date('2026-08-09T18:00:00.000Z'),
      });
      mockPaymentGet.mockResolvedValue({
        ...MOCK_PAYMENT,
        external_reference: reference,
        transaction_amount: 1399.84,
      });
      const url = `https://example.com/api/mp/webhook?data.id=12345&ref=${reference}`;

      const res = await POST(makeRequest({ url }));

      expect(res.status).toBe(200);
      expect(reference).toMatch(/^agua_[A-Za-z0-9_-]+$/);
      expect(reference.length).toBeLessThanOrEqual(64);
      expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
        perfilId: 'perf-001',
        circuitoId: 'circuito-001',
        periodos,
        mercadoPagoPaymentId: '12345',
        paymentIntentReference: reference,
      }));
    });

    it('pasa el collector_id del pago a execute', async () => {
      await POST(makeRequest());
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({ mercadoPagoCollectorId: '98765' }),
      );
    });

    it.each([
      ['referencia distinta', { external_reference: 'agua|otro-perfil|6|2025|0|100.00' }],
      ['importe distinto', { transaction_amount: 1 }],
      ['moneda distinta', { currency_id: 'USD' }],
      ['collector distinto', { collector_id: 11111 }],
      ['paymentId distinto', { id: 99999 }],
    ])('NO acredita cuando falla el binding de %s', async (_label, override) => {
      mockPaymentGet.mockResolvedValue({ ...MOCK_PAYMENT, ...override });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ received: true, credited: false });
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
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
      expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
    });

    it('usa external_reference del pago si no hay ref en URL', async () => {
      const url = 'https://example.com/api/mp/webhook?data.id=12345';
      await POST(makeRequest({ url }));
      // No ref → paymentClient is null → execute not called
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('manejo de errores', () => {
    it('no acredita y alerta cuando un periodo pertenece a otro paymentId', async () => {
      mockExecute.mockRejectedValue(new MercadoPagoPeriodConflictError('12345', [{
        mes: 6,
        anio: 2025,
        existingPaymentId: 'payment-anterior',
      }]));

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ received: true, credited: false, conflict: true });
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(MercadoPagoPeriodConflictError),
        expect.objectContaining({ tags: expect.objectContaining({ error_type: 'payment_period_conflict' }) }),
      );
      expect(mockSchedulePushDispatch).not.toHaveBeenCalled();
    });

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
