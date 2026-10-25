import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

export function createMercadoPagoClients(accessToken: string) {
  const client = new MercadoPagoConfig({ accessToken });

  return {
    preferenceClient: new Preference(client),
    paymentClient: new Payment(client),
  };
}

export type MercadoPagoErrorDetails = {
  code: string;
  userMessage: string;
  httpStatus: number;
  status?: number;
  message: string;
  cause?: unknown;
};

export function extractMercadoPagoError(err: unknown): MercadoPagoErrorDetails {
  let status: number | undefined;
  let message = '';
  let cause: unknown;

  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.status === 'number') status = obj.status;
    if (typeof obj.message === 'string') message = obj.message;
    if (obj.cause) cause = obj.cause;
    if (!message && typeof obj.error === 'string') message = obj.error;
  } else if (typeof err === 'string') {
    message = err;
  } else if (err instanceof Error) {
    message = err.message;
  }

  const lower = message.toLowerCase();

  // Intento de autopago: el pagador es la misma cuenta colectora de Mercado Pago
  if (lower.includes('collector_id') && (lower.includes('payer') || lower.includes('same as'))) {
    return {
      code: 'SISCO-301',
      userMessage: 'No es posible pagar con la misma cuenta administradora de Mercado Pago. Usa una cuenta de pagador distinta.',
      httpStatus: 400,
      status: 400,
      message,
      cause,
    };
  }

  // Credenciales inválidas, revocadas o no autorizadas
  if (status === 401 || lower.includes('unauthorized') || lower.includes('invalid access token') || lower.includes('invalid token')) {
    return {
      code: 'SISCO-301',
      userMessage: 'Las credenciales de Mercado Pago del fraccionamiento son inválidas o han expirado.',
      httpStatus: 502,
      status: 401,
      message,
      cause,
    };
  }

  // Incompatibilidad de URLs de retorno o auto_return
  if (lower.includes('back_url') || lower.includes('auto_return') || lower.includes('notification_url')) {
    return {
      code: 'SISCO-301',
      userMessage: 'La configuración de redirección de pago no es compatible con el entorno actual.',
      httpStatus: 502,
      status: status ?? 400,
      message,
      cause,
    };
  }

  // Fallo de conectividad, timeout o DNS
  if (lower.includes('fetch failed') || lower.includes('timeout') || lower.includes('network') || lower.includes('econnrefused')) {
    return {
      code: 'SISCO-301',
      userMessage: 'No se pudo conectar con Mercado Pago. Verifica tu conexión e intenta de nuevo.',
      httpStatus: 504,
      status: 504,
      message,
      cause,
    };
  }

  // Error general devuelto por la pasarela de pagos
  return {
    code: 'SISCO-301',
    userMessage: 'Mercado Pago no pudo procesar la solicitud de pago.',
    httpStatus: status && status >= 400 && status < 600 ? status : 502,
    status,
    message: message || 'Mercado Pago preference creation failed',
    cause,
  };
}
