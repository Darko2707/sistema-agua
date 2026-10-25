import { describe, expect, it } from 'vitest';
import { extractMercadoPagoError } from '@/lib/mercadopago';
import { userFacingError } from '@/lib/user-facing-error';
import { rateLimitResponse, type RateLimitDecision } from '@/lib/rate-limit-guard';

describe('extractMercadoPagoError', () => {
  it('detecta y traduce el error de autopago (collector_id = payer_id)', () => {
    const error = extractMercadoPagoError({
      status: 400,
      message: 'collector_id cannot be the same as payer_id',
    });

    expect(error.code).toBe('SISCO-301');
    expect(error.httpStatus).toBe(400);
    expect(error.userMessage).toContain('misma cuenta administradora');
  });

  it('detecta credenciales inválidas o expiradas (401)', () => {
    const error = extractMercadoPagoError({
      status: 401,
      message: 'invalid access token',
    });

    expect(error.code).toBe('SISCO-301');
    expect(error.httpStatus).toBe(502);
    expect(error.userMessage).toContain('credenciales de Mercado Pago del fraccionamiento son inválidas');
  });

  it('detecta fallos de conectividad y timeout (fetch failed)', () => {
    const error = extractMercadoPagoError(new TypeError('fetch failed'));

    expect(error.code).toBe('SISCO-301');
    expect(error.httpStatus).toBe(504);
    expect(error.userMessage).toContain('No se pudo conectar con Mercado Pago');
  });

  it('detecta incompatibilidad de URLs de redirección (back_urls)', () => {
    const error = extractMercadoPagoError({
      status: 400,
      message: 'back_urls.success must be a valid URL',
    });

    expect(error.code).toBe('SISCO-301');
    expect(error.httpStatus).toBe(502);
    expect(error.userMessage).toContain('configuración de redirección de pago no es compatible');
  });

  it('no expone datos sensibles ni secretos en el mensaje de usuario', () => {
    const error = extractMercadoPagoError({
      status: 500,
      message: 'Internal server error with token APP_USR-12345678-secret-token',
    });

    expect(error.userMessage).not.toContain('APP_USR');
    expect(error.userMessage).not.toContain('secret');
    expect(error.userMessage).toBe('Mercado Pago no pudo procesar la solicitud de pago.');
  });
});

describe('userFacingError - Códigos y Correlación', () => {
  it('respeta el código explícito de error y agrega la referencia de correlación', () => {
    const err = Object.assign(new Error('Mercado Pago preference failed'), {
      code: 'SISCO-301',
      correlationId: 'req_1234567890abcdef',
    });

    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-301: No pudimos iniciar el pago');
    expect(formatted).toContain('(Ref: req_1234567890abcdef)');
  });

  it('mapea correctamente el código de rate limit SISCO-429', () => {
    const err = Object.assign(new Error('Demasiadas solicitudes. Espera un momento.'), {
      code: 'SISCO-429',
    });

    const formatted = userFacingError(err);
    expect(formatted).toContain('SISCO-429: Límite de solicitudes alcanzado');
  });

  it('mapea correctamente conflictos de periodos SISCO-202', () => {
    const err = new Error('No hay suficientes periodos de agua disponibles');
    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-202: Los cargos seleccionados cambiaron');
  });

  it('mapea reconexión pendiente SISCO-203', () => {
    const err = new Error('La reconexion esta pendiente de ser realizada');
    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-203: Reconexión en proceso');
  });

  it('mapea falta de suscripción operativa SISCO-423', () => {
    const err = new Error('El fraccionamiento no tiene una suscripcion operativa vigente');
    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-423: Fraccionamiento temporalmente no disponible');
  });

  it('mapea falta de cargos de vivienda SISCO-403', () => {
    const err = new Error('Esta cuenta no tiene cargos de vivienda habilitados');
    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-403: Cuenta no habilitada para cobros');
  });

  it('utiliza el mensaje descriptivo para SISCO-302 en caso de fallback', () => {
    const err = new Error('Un error totalmente imprevisto e incomprensible');
    const formatted = userFacingError(err, 'SISCO-302');
    expect(formatted).toContain('SISCO-302:');
    expect(formatted).toContain('No pudimos completar la accion');
  });
});

describe('rateLimitResponse', () => {
  it('devuelve una respuesta HTTP 429 con cuerpo JSON estructurado', async () => {
    const decision: RateLimitDecision = {
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30000,
    };

    const res = rateLimitResponse(decision);
    expect(res.status).toBe(429);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Retry-After')).toBeDefined();

    const data = await res.json();
    expect(data.code).toBe('SISCO-429');
    expect(data.error).toContain('Demasiadas solicitudes');
    expect(data.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

