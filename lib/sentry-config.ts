export function sentryEnvironment(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
    ?? process.env.SENTRY_ENVIRONMENT
    ?? process.env.VERCEL_ENV
    ?? process.env.NODE_ENV
    ?? 'development';
}
