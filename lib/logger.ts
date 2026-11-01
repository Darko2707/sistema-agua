type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

const ENV_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const IS_PROD   = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= (LEVELS[ENV_LEVEL] ?? LEVELS.info);
}

function emit(level: LogLevel, event: string, data: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  if (IS_PROD) {
    const entry = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...data });
    if (level === 'error') console.error(entry);
    else console.log(entry);
    return;
  }

  const prefix = `[${level.toUpperCase().padEnd(5)}] ${new Date().toISOString()} ${event}`;
  const rest = Object.keys(data).length ? data : undefined;
  if (level === 'error') console.error(prefix, rest ?? '');
  else console.log(prefix, rest ?? '');
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(payload: { event: string; error?: unknown } & Record<string, unknown>): void;
  error(event: string, error?: unknown, data?: Record<string, unknown>): void;
}

export const logger: Logger = {
  debug(event: string, data?: Record<string, unknown>): void {
    emit('debug', event, data ?? {});
  },

  info(event: string, data?: Record<string, unknown>): void {
    emit('info', event, data ?? {});
  },

  warn(event: string, data?: Record<string, unknown>): void {
    emit('warn', event, data ?? {});
  },

  error(
    eventOrPayload: string | ({ event: string; error?: unknown } & Record<string, unknown>),
    error?: unknown,
    data?: Record<string, unknown>
  ): void {
    let event: string;
    let err: unknown;
    let errFields: Record<string, unknown>;

    if (typeof eventOrPayload === 'object' && eventOrPayload !== null) {
      const { event: ev, error: e, ...rest } = eventOrPayload;
      event = ev;
      err = e;
      errFields = { ...rest };
    } else {
      event = eventOrPayload;
      err = error;
      errFields = { ...(data ?? {}) };
    }

    if (err instanceof Error) {
      errFields.errorMessage = err.message;
      if (!IS_PROD) errFields.stack = err.stack;
    } else if (typeof err === 'object' && err !== null) {
      errFields.error = JSON.stringify(err);
    } else if (err !== undefined) {
      errFields.error = String(err);
    }

    emit('error', event, errFields);
  },
};
