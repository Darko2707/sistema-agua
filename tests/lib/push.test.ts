import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({
  default: { sendNotification: vi.fn() },
}));

import {
  classifyPushFailure,
  PushConfigurationError,
  pushFailureLabel,
  pushRetryAfterMs,
} from '@/lib/push';

function providerError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error('respuesta sensible del proveedor'), { statusCode });
}

describe('classifyPushFailure', () => {
  it.each([404, 410])('clasifica HTTP %i como suscripcion obsoleta', (statusCode) => {
    expect(classifyPushFailure(providerError(statusCode))).toBe('stale');
  });

  it.each([401, 403])('clasifica HTTP %i como error de configuracion', (statusCode) => {
    expect(classifyPushFailure(providerError(statusCode))).toBe('configuration');
  });

  it('clasifica PushConfigurationError como error de configuracion', () => {
    expect(classifyPushFailure(new PushConfigurationError())).toBe('configuration');
  });

  it.each([429, 500, 502, 503])('clasifica HTTP %i como transitorio', (statusCode) => {
    expect(classifyPushFailure(providerError(statusCode))).toBe('transient');
  });

  it('clasifica timeout o fallo de transporte sin statusCode como transitorio', () => {
    const timeout = Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' });

    expect(classifyPushFailure(timeout)).toBe('transient');
  });

  it.each([400, 413, 422])('clasifica HTTP %i como fallo permanente', (statusCode) => {
    expect(classifyPushFailure(providerError(statusCode))).toBe('permanent');
  });

  it('genera una etiqueta sanitizada sin incluir el mensaje del proveedor', () => {
    const error = providerError(410);

    expect(pushFailureLabel(error)).toBe('stale:410');
    expect(pushFailureLabel(error)).not.toContain(error.message);
  });
});

describe('pushRetryAfterMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('convierte Retry-After en segundos a milisegundos', () => {
    const error = { headers: { 'retry-after': '120' } };

    expect(pushRetryAfterMs(error)).toBe(120_000);
  });

  it('acepta una fecha HTTP futura', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    const error = { headers: { 'Retry-After': 'Sun, 09 Aug 2026 12:02:00 GMT' } };

    expect(pushRetryAfterMs(error)).toBe(120_000);
  });

  it.each([
    undefined,
    {},
    { headers: {} },
    { headers: { 'retry-after': '' } },
    { headers: { 'retry-after': 'fecha-invalida' } },
    { headers: { 'retry-after': 30 } },
  ])('devuelve null para un Retry-After ausente o invalido', (error) => {
    expect(pushRetryAfterMs(error)).toBeNull();
  });

  it('limita una cantidad de segundos a seis horas', () => {
    const error = { headers: { 'retry-after': '999999' } };

    expect(pushRetryAfterMs(error)).toBe(6 * 60 * 60 * 1_000);
  });

  it('limita una fecha HTTP lejana a seis horas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    const error = { headers: { 'retry-after': 'Mon, 10 Aug 2026 12:00:00 GMT' } };

    expect(pushRetryAfterMs(error)).toBe(6 * 60 * 60 * 1_000);
  });
});
