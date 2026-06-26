import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn:              process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment:      process.env.NODE_ENV,
      enabled:          !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug:            process.env.NODE_ENV !== 'production',
    });
  }
}

// Captures every server-side error: Route Handlers, Server Components, Server Actions, Proxy.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(err, request, context);
};
