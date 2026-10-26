import { MercadoPagoConfig, Payment, Preference, User } from 'mercadopago';

export function createMercadoPagoClients(accessToken: string) {
  const client = new MercadoPagoConfig({ accessToken });

  return {
    preferenceClient: new Preference(client),
    paymentClient: new Payment(client),
  };
}

export type MercadoPagoErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'self_payment'
  | 'configuration'
  | 'network'
  | 'provider';

export type MercadoPagoErrorDetails = {
  code: string;
  userMessage: string;
  httpStatus: number;
  status?: number;
  category: MercadoPagoErrorCategory;
  /** Datos seguros para logs; nunca contiene token, headers ni el error crudo. */
  diagnostic: {
    providerCode?: string;
    providerMessage?: string;
    causeCodes?: string[];
  };
};

const SENSITIVE_VALUE = /\b(?:APP_USR|TEST|Bearer)\s*[-:]?\s*[A-Za-z0-9._~+\-/=]{8,}\b/gi;
const SENSITIVE_FIELD = /(token|authorization|password|secret|api[_-]?key)/i;

function safeText(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(SENSITIVE_VALUE, '[REDACTED]').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function safeProviderCode(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const code = String(value).trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : undefined;
}

function readSafeCauseCodes(value: unknown): string[] | undefined {
  const causes = Array.isArray(value) ? value : value ? [value] : [];
  const codes = causes.flatMap((cause) => {
    if (!cause || typeof cause !== 'object') return [];
    const obj = cause as Record<string, unknown>;
    if (Object.keys(obj).some((key) => SENSITIVE_FIELD.test(key))) return [];
    const code = safeProviderCode(obj.code ?? obj.error);
    return code ? [code] : [];
  });
  return codes.length > 0 ? [...new Set(codes)].slice(0, 5) : undefined;
}

function errorParts(err: unknown) {
  if (!err || typeof err !== 'object') {
    return { message: safeText(err) };
  }

  const obj = err as Record<string, unknown>;
  const apiResponse = obj.api_response && typeof obj.api_response === 'object'
    ? obj.api_response as Record<string, unknown>
    : undefined;
  const status = typeof obj.status === 'number'
    ? obj.status
    : typeof apiResponse?.status === 'number'
      ? apiResponse.status
      : undefined;
  const message = safeText(obj.message) ?? safeText(obj.error);
  const providerCode = safeProviderCode(obj.error ?? obj.code);
  const causeCodes = readSafeCauseCodes(obj.cause);

  return { status, message, providerCode, causeCodes };
}

export function extractMercadoPagoError(err: unknown): MercadoPagoErrorDetails {
  const { status, message, providerCode, causeCodes } = errorParts(err);
  const lower = (message ?? '').toLowerCase();
  const diagnostic = {
    ...(providerCode ? { providerCode } : {}),
    ...(message ? { providerMessage: message } : {}),
    ...(causeCodes ? { causeCodes } : {}),
  };

  // Intento de autopago: el pagador es la misma cuenta colectora de Mercado Pago
  if (lower.includes('collector_id') && (lower.includes('payer') || lower.includes('same as'))) {
    return {
      code: 'SISCO-301',
      userMessage: 'No es posible pagar con la misma cuenta administradora de Mercado Pago. Usa una cuenta de pagador distinta.',
      httpStatus: 400,
      status: 400,
      category: 'self_payment',
      diagnostic,
    };
  }

  // Credenciales inválidas, revocadas o no autorizadas
  if (status === 401 || lower.includes('invalid access token') || lower.includes('invalid token')) {
    return {
      code: 'SISCO-301',
      userMessage: 'Las credenciales de Mercado Pago del fraccionamiento son inválidas o han expirado.',
      httpStatus: 502,
      status: 401,
      category: 'authentication',
      diagnostic,
    };
  }

  if (status === 403 || lower.includes('forbidden') || lower.includes('policy returned unauthorized')) {
    return {
      code: 'SISCO-301',
      userMessage: 'La cuenta vendedora de Mercado Pago no está autorizada para crear este checkout. Revisa la configuración del fraccionamiento.',
      httpStatus: 502,
      status: status ?? 403,
      category: 'authorization',
      diagnostic,
    };
  }

  // Incompatibilidad de URLs de retorno o auto_return
  if (lower.includes('back_url') || lower.includes('auto_return') || lower.includes('notification_url')) {
    return {
      code: 'SISCO-301',
      userMessage: 'La configuración de redirección de pago no es compatible con el entorno actual.',
      httpStatus: 502,
      status: status ?? 400,
      category: 'configuration',
      diagnostic,
    };
  }

  // Fallo de conectividad, timeout o DNS
  if (lower.includes('fetch failed') || lower.includes('timeout') || lower.includes('network') || lower.includes('econnrefused')) {
    return {
      code: 'SISCO-301',
      userMessage: 'No se pudo conectar con Mercado Pago. Verifica tu conexión e intenta de nuevo.',
      httpStatus: 504,
      status: 504,
      category: 'network',
      diagnostic,
    };
  }

  // Error general devuelto por la pasarela de pagos
  return {
    code: 'SISCO-301',
    userMessage: 'Mercado Pago no pudo procesar la solicitud de pago.',
    httpStatus: status && status >= 400 && status < 600 ? status : 502,
    status,
    category: 'provider',
    diagnostic,
  };
}

export type MercadoPagoAccountValidation =
  | { ok: true; collectorId: string }
  | { ok: false; userMessage: string; diagnostic: MercadoPagoErrorDetails['diagnostic'] };

/**
 * Comprueba, sin crear cobros, que el token pertenezca al collector configurado.
 * La consulta GET /users/me es la única llamada externa de esta validación.
 */
export async function validateMercadoPagoAccount(
  accessToken: string,
  expectedCollectorId: string,
): Promise<MercadoPagoAccountValidation> {
  try {
    const account = await new User(new MercadoPagoConfig({ accessToken })).get();
    const collectorId = typeof account.id === 'number' || typeof account.id === 'string'
      ? String(account.id)
      : '';

    if (!collectorId) {
      return {
        ok: false,
        userMessage: 'Mercado Pago no devolvió el identificador de la cuenta vendedora. Vuelve a ingresar las credenciales.',
        diagnostic: {},
      };
    }
    if (collectorId !== expectedCollectorId) {
      return {
        ok: false,
        userMessage: 'El Collector ID no corresponde al Access Token proporcionado. Usa los datos de la misma cuenta vendedora.',
        diagnostic: { providerCode: 'collector_token_mismatch' },
      };
    }
    return { ok: true, collectorId };
  } catch (error) {
    const details = extractMercadoPagoError(error);
    return {
      ok: false,
      userMessage: details.category === 'network'
        ? 'No se pudo validar la cuenta de Mercado Pago. Intenta guardar nuevamente.'
        : 'Mercado Pago rechazó el Access Token. Verifica que pertenezca a la cuenta vendedora indicada.',
      diagnostic: details.diagnostic,
    };
  }
}
