import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue({
  procesados:   3,
  totalPagados: 7,
  totalMorosos: 3,
  mes:          6,
  anio:         2025,
  dia:          15,
  mensaje:      '3 residentes marcados como pendientes de corte',
});

vi.mock('@/src/application/cron/verificar-morosos.handler', () => ({
  VerificarMorososHandler: class {
    // Arrow function field — avoids TDZ: mockExecute is only accessed at call time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute = (...args: any[]) => mockExecute(...args);
  },
}));

vi.mock('@/src/infrastructure/db/repositories', () => ({
  residenteRepo: {}, pagoRepo: {},
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(), captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────────
import { GET } from '@/app/api/cron/cortes/route';
import * as Sentry from '@sentry/nextjs';

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeRequest(opts?: { authorization?: string | null }) {
  const headers: Record<string, string> = {};
  const auth = opts?.authorization;
  if (auth !== null) {
    headers['authorization'] = auth ?? 'Bearer valid-secret';
  }
  return new Request('https://example.com/api/cron/cortes', {
    method: 'GET',
    headers,
  });
}

// ── Setup / teardown ───────────────────────────────────────────────────────────
beforeEach(() => {
  process.env.CRON_SECRET = 'valid-secret';
  mockExecute.mockResolvedValue({
    procesados: 3, totalPagados: 7, totalMorosos: 3,
    mes: 6, anio: 2025, dia: 15,
    mensaje: '3 residentes marcados como pendientes de corte',
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('GET /api/cron/cortes', () => {
  describe('validación de configuración', () => {
    it('devuelve 503 si CRON_SECRET no está configurado', async () => {
      delete process.env.CRON_SECRET;
      const res = await GET(makeRequest());
      expect(res.status).toBe(503);
    });

    it('captura en Sentry si CRON_SECRET falta', async () => {
      delete process.env.CRON_SECRET;
      await GET(makeRequest());
      expect(Sentry.captureMessage).toHaveBeenCalled();
    });

    it('no llama al handler si CRON_SECRET falta', async () => {
      delete process.env.CRON_SECRET;
      await GET(makeRequest());
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('autenticación Bearer', () => {
    it('devuelve 401 sin header Authorization', async () => {
      const res = await GET(makeRequest({ authorization: null }));
      expect(res.status).toBe(401);
    });

    it('devuelve 401 con token incorrecto', async () => {
      const res = await GET(makeRequest({ authorization: 'Bearer wrong-token' }));
      expect(res.status).toBe(401);
    });

    it('devuelve 401 con prefijo Bearer faltante', async () => {
      const res = await GET(makeRequest({ authorization: 'valid-secret' }));
      expect(res.status).toBe(401);
    });

    it('no llama al handler con token incorrecto', async () => {
      await GET(makeRequest({ authorization: 'Bearer nope' }));
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('acepta token correcto y devuelve 200', async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  describe('respuesta exitosa', () => {
    it('devuelve JSON con los campos del resultado', async () => {
      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.procesados).toBe(3);
      expect(body.totalPagados).toBe(7);
      expect(body.totalMorosos).toBe(3);
      expect(body.mes).toBe(6);
      expect(body.anio).toBe(2025);
      expect(body.mensaje).toBe('3 residentes marcados como pendientes de corte');
    });

    it('incluye campo fecha ISO en la respuesta', async () => {
      const res = await GET(makeRequest());
      const body = await res.json();
      expect(body.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('devuelve 200 cuando el cron fue omitido (antes del día de corte)', async () => {
      mockExecute.mockResolvedValue({
        procesados: 0, totalPagados: 0, totalMorosos: 0,
        mes: 6, anio: 2025, dia: 3,
        mensaje: 'No es día de corte (antes del día 6)',
      });
      const res = await GET(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.procesados).toBe(0);
    });
  });

  describe('manejo de errores', () => {
    it('devuelve 500 si el handler lanza un error inesperado', async () => {
      mockExecute.mockRejectedValue(new Error('DB connection lost'));
      const res = await GET(makeRequest());
      expect(res.status).toBe(500);
    });

    it('captura el error en Sentry si el handler falla', async () => {
      const err = new Error('DB crash');
      mockExecute.mockRejectedValue(err);
      await GET(makeRequest());
      expect(Sentry.captureException).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ tags: expect.objectContaining({ job: 'cortes' }) }),
      );
    });
  });
});
