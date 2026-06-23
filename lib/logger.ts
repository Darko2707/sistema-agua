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
    level === 'error' ? console.error(entry) : console.log(entry);
    return;
  }

  const prefix = `[${level.toUpperCase().padEnd(5)}] ${new Date().toISOString()} ${event}`;
  const rest = Object.keys(data).length ? data : undefined;
  level === 'error' ? console.error(prefix, rest ?? '') : console.log(prefix, rest ?? '');
}

export const logger = {
  debug(event: string, data?: Record<string, unknown>): void {
    emit('debug', event, data ?? {});
  },

  info(event: string, data?: Record<string, unknown>): void {
    emit('info', event, data ?? {});
  },

  warn(event: string, data?: Record<string, unknown>): void {
    emit('warn', event, data ?? {});
  },

  error(event: string, error?: unknown, data?: Record<string, unknown>): void {
    const errFields: Record<string, unknown> = { ...(data ?? {}) };

    if (error instanceof Error) {
      errFields.errorMessage = error.message;
      if (!IS_PROD) errFields.stack = error.stack;
    } else if (error !== undefined) {
      errFields.error = String(error);
    }

    emit('error', event, errFields);
  },
};
